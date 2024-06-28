import { Meta } from './Meta';

export interface Summary {
  meta: Meta;
  lookup: string[][];
  chunks?: string[];
}
