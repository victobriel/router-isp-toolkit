/**
 * Router: domain contract for router adapters.
 * Re-exports the port so application/infra refer to the contract, not the implementation.
 */
export type { IRouter as Router } from "../ports/IRouter.js";
