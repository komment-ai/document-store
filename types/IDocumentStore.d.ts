import { Meta } from './Meta';

export interface IDocumentStore {
  CHUNK_SIZE: number;
  meta: Meta;
  lookup: string[][];
  status: {
    summary: boolean;
    chunks: boolean;
  };
}
