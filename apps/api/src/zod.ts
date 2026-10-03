// Lets routes describe their requests and responses with Zod schemas, the same ones as
// the web app, instead of Fastify's default JSON Schema.
import type {
  FastifySchemaCompiler,
  FastifySerializerCompiler,
  FastifyTypeProvider,
} from 'fastify';
import type { z } from 'zod';

/**
 * Validates the parts of a request (params, querystring, body) before the handler runs.
 * The handler receives the cleaned-up values (e.g. trimmed); an invalid request gets a 400.
 */
export const zodValidatorCompiler: FastifySchemaCompiler<z.ZodType> =
  ({ schema }) =>
  (data) => {
    const result = schema.safeParse(data);
    if (result.success) return { value: result.data };
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    return { error: new Error(problems.join(', ')) };
  };

/**
 * Checks a response against its schema before sending it. Fields the schema does not
 * declare are left out: a bug cannot leak data that is not part of the API contract.
 */
export const zodSerializerCompiler: FastifySerializerCompiler<z.ZodType> =
  ({ schema }) =>
  (data) =>
    JSON.stringify(schema.parse(data));

/** Gives handlers the types of `request.params`... and of their answer, from the schemas. */
export interface ZodTypeProvider extends FastifyTypeProvider {
  readonly validator: this['schema'] extends z.ZodType
    ? z.output<this['schema']>
    : unknown;
  readonly serializer: this['schema'] extends z.ZodType
    ? z.input<this['schema']>
    : unknown;
}
