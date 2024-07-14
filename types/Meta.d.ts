/**
 * @description Defines a data structure with four properties: `version`, `createdAt`,
 * `updatedAt`, and an arbitrary key-value pair `[key: string]` where the value can
 * be any type.
 */
export interface Meta {
  version: string;
  created_at: Date;
  updated_at: Date;
  [key: string]: any;
}
