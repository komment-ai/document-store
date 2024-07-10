/**
 * @description Defines a set of properties that consist of a version, creation and
 * update dates, and arbitrary data stored under key strings.
 */
export interface Meta {
  version: string;
  created_at: Date;
  updated_at: Date;
  [key: string]: any;
}
