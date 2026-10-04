// Render-time stub: effects never run under renderToString, so nothing should
// call the network. If something does, fail loudly instead of hanging.
const boom = (m) => () => { throw new Error(`unexpected API call during render: ${m}`); };
export const get = boom("get");
export const post = boom("post");
export const put = boom("put");
export class ApiError extends Error {}
export default { get, post, put };
