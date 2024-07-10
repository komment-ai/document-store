import { Meta } from "./Meta";

/**
 * @description Defines a set of properties and methods for storing and managing
 * documents. It includes the document chunk size, namespace, metadata, and a lookup
 * array. Additionally, it provides a status object with summary and chunks properties.
 */
export interface IDocumentStore {
  CHUNK_SIZE: number;
  namespace: string;
  meta: Meta;
  lookup: string[][];
  status: {
    summary: boolean;
    chunks: boolean;
  };
}
