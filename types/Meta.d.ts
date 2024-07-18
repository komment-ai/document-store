/**
 * @description Defines an object with four properties: `version`, `createdAt`,
 * `updatedAt`, and `[key: string]`. The `version` property is of type `string`, while
 * the `createdAt` and `updatedAt` properties are of type `Date`. The `[key: string]`
 * property is akin to an empty array, allowing any type of value to be stored within
 * it.
 */
export interface Meta {
  version: string;
  created_at: Date;
  updated_at: Date;
  [key: string]: any;
}
