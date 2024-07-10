import { Meta } from './Meta';

/**
 * @description Defines a set of properties: `meta`, `lookup`, and `chunks`. The
 * `meta` property is an object with additional information about the summary, while
 * the `lookup` property is an array of arrays representing the lookup tables for
 * each chunk. The `chunks` property can optionally be defined as an array of strings,
 * representing the chunks of data in the summary.
 */
export interface Summary {
  meta: Meta;
  lookup: string[][];
  chunks?: string[];
}
