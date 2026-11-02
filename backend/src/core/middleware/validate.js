/**
 * validate({ params, query, body }) con esquemas zod.
 * Express 5 expone req.query como getter de solo lectura, así que el resultado
 * ya convertido y limpio se deja en req.valid.
 */
export const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const key of ['params', 'query', 'body']) {
    if (schemas[key]) req.valid[key] = schemas[key].parse(req[key] ?? {});
  }
  next();
};
