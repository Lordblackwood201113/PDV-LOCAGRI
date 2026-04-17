/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cashSessions from "../cashSessions.js";
import type * as clients from "../clients.js";
import type * as expenses from "../expenses.js";
import type * as products from "../products.js";
import type * as references from "../references.js";
import type * as safe from "../safe.js";
import type * as sales from "../sales.js";
import type * as stock from "../stock.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cashSessions: typeof cashSessions;
  clients: typeof clients;
  expenses: typeof expenses;
  products: typeof products;
  references: typeof references;
  safe: typeof safe;
  sales: typeof sales;
  stock: typeof stock;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
