/**
 * DocumentStore
 *
 * Manage adding, retrieving and updating docs in the .{namespace} folder
 *
 * Usage:
 * const getRemote = () => {} // method to fetch from remote store
 * const docStore = new DocumentStore(getRemote);
 * await docStore.loadSummary();
 * const structureFileContent = await docStore.getFile('path/to/file.js')
 *
 * await docStore.addFile(structuredFileContent);
 */

import { IDocumentStore } from "../types/IDocumentStore";
import { StructuredFile } from "../types/StructuredFile";
import { Summary } from "../types/Summary";

const CHUNK_SIZE = 40;
const DOCUMENT_STORE_VERSION = "1";

/**
 * @description Is responsible for managing and organizing code chunks based on their
 * contents, creating a structured file that can be used for efficient content retrieval
 * and manipulation.
 * 
 * @implements {IDocumentStore}
 */
class DocumentStore implements IDocumentStore {
  CHUNK_SIZE: number;
  namespace: string;
  getRemote: (...args: any[]) => Promise<Record<any, any>>;
  meta: {
    version: string;
    created_at: Date;
    updated_at: Date;
    [key: string]: any;
  };
  metaTemplate: Record<string, any>;
  lookup: string[][];
  chunks: StructuredFile[][];
  content: StructuredFile[];
  status: {
    summary: boolean;
    chunks: boolean;
  };

  /**
   * @description Sets up class variables and properties, including `CHUNK_SIZE`,
   * `namespace`, `getRemote`, `meta`, `lookup`, `chunks`, and `content`. It also checks
   * for required inputs and sets default values for some properties.
   * 
   * @param {string*} namespace - Used to set the name space for the chunker, which
   * allows the chunker to identify which chunks belong to the same namespace.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>*} getRemote - Required to
   * return a promise containing a record with data.
   * 
   * @param {Record<string, any>*} additionalMeta - Used to store custom metadata for
   * the document.
   */
  constructor(
    namespace: string,
    getRemote: (...args: any[]) => Promise<Record<any, any>>,
    additionalMeta: Record<string, any> = {},
  ) {
    if (!namespace) throw new Error("namespace is required");
    if (!getRemote) throw new Error("getRemote method is required");

    this.CHUNK_SIZE = CHUNK_SIZE;
    this.namespace = namespace;
    this.getRemote = getRemote;
    this.meta = {
      version: DOCUMENT_STORE_VERSION,
      updated_at: new Date(),
      created_at: new Date(),
      ...additionalMeta,
    };
    this.metaTemplate = additionalMeta;
    this.lookup = [];
    this.chunks = [];
    this.content = [];
    this.status = {
      summary: false,
      chunks: false,
    };
  }

  /**
   * @description Updates the `updatedAt` metadata property with the provided `Date` object.
   * 
   * @param {Date*} updated_at - Used to update the "updated at" metadata of the object
   * being updated.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Updates and stores summary information in the local store based on
   * remote information, and sets metadata properties for the local store.
   */
  loadSummary = async () => {
    let summary: Summary = {
      meta: {
        version: DOCUMENT_STORE_VERSION,
        created_at: new Date(),
        updated_at: new Date(),
        ...this.metaTemplate,
      },
      lookup: [],
      chunks: [],
    };
    try {
      const remoteSummary = (await this.getRemote(
        this.getChunkSummaryPath(),
      )) as Summary;

      if (Object.keys(remoteSummary).length) {
        summary = remoteSummary;
      }
    } catch (error) {
      console.info("No docs stored yet");
    }

    this.meta.version = summary?.meta?.version || DOCUMENT_STORE_VERSION;
    this.meta.created_at = summary?.meta?.created_at || new Date();
    this.meta.updated_at = summary?.meta?.updated_at || new Date();
    Object.entries(this.metaTemplate).forEach(([key, value]) => {
      // Updates the `this.meta` object with values from the `summary.meta` object or the
      // provided `value`, if the `summary` object is not defined or does not have a property
      // for the specified key.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Async loads the document chunks by iterating through the chunk indices
   * and loading each chunk synchronously using the `loadChunk` method. It also sets
   * the `chunks` property to `true` once all chunks have been loaded.
   */
  load = async () => {
    if (!this.status.summary) {
      await this.loadSummary();
    }
    const chunkIndices = this.lookup.map((_keys: string[], i: number) => i);

    for (const chunkIndex of chunkIndices) {
      await this.loadChunk(chunkIndex);
    }

    this.status.chunks = true;
  };

  chunkIndexToChunkKey = (k: number): string => `${k}`.padStart(5, "0");

  chunkKeyToChunkPath = (k: string): string => `.${this.namespace}/${k}.json`;

  getChunkSummaryPath = (): string =>
    `.${this.namespace}/${this.namespace}.json`;

  /**
   * @description Updates the metadata of a document by combining the existing metadata
   * and additional metadata passed as an argument, creating a new metadata object that
   * includes both.
   * 
   * @param {Record<string, any>*} additionalMeta - Used to update the metadata by
   * adding new key-value pairs to the existing ones.
   */
  updateMetadata = (additionalMeta: Record<string, any>) => {
    this.meta = {
      ...this.meta,
      ...additionalMeta,
    };
  };

  fileIndexToChunkId = (fileIndex: number) =>
    Math.floor(fileIndex / CHUNK_SIZE);

  isChunkLoaded = (chunkIndex: number): boolean =>
    this.chunks[chunkIndex]?.length > 0;

  /**
   * @description Async loads a chunk of the document from the server, given its index,
   * and appends it to the content and chunks collections if successful.
   * 
   * @param {number*} chunkIndex - Used to identify the chunk being loaded. It serves
   * as an index to access the appropriate chunk data from the `chunks` array.
   * 
   * @returns {Promise<boolean>*} Resolved to true if the chunk was loaded successfully,
   * or false otherwise.
   */
  loadChunk = async (chunkIndex: number): Promise<boolean> => {
    if (!this.isChunkLoaded(chunkIndex)) {
      try {
        const chunk: StructuredFile[] = (await this.getRemote(
          this.chunkKeyToChunkPath(this.chunkIndexToChunkKey(chunkIndex)),
        )) as StructuredFile[];

        this.content = this.content.concat(chunk);

        this.chunks[chunkIndex] = chunk;
      } catch (error) {
        return false;
      }
    }
    return true;
  };
  /**
   * @description Retrieves a file from the store based on its path. It first checks
   * if the summary has been loaded, then calculates the chunk it is in and loads it
   * if necessary. Finally, it returns the file index within that chunk.
   * 
   * @param {string*} path - Used to identify the file being retrieved, which must match
   * the path of a file in the current summary.
   * 
   * @returns {Promise<StructuredFile | null>*} Either a StructuredFile object or null
   * if the file cannot be found or has already been loaded.
   */
  getFile = async (path: string): Promise<StructuredFile | null> => {
    if (!this.status.summary)
      throw Error("Must call .loadSummary before accessing files");

    // calculate the chunk it is in
    const chunkIndex = this.getChunkFileIsIn(path);
    if (chunkIndex === -1) {
      return null;
    }
    if (!this.isChunkLoaded(chunkIndex)) {
      await this.loadChunk(chunkIndex);
    }
    const fileIndexInChunk = this.getFileIndexInChunk(chunkIndex, path);
    // console.debug(
    //   `File is in Chunk #${chunkIndex} at index #${fileIndexInChunk}`,
    // );

    if (this.chunks[chunkIndex][fileIndexInChunk].path !== path) {
      console.error("Incorrect chunk/lookup. Rebuild?");
    }

    return this.chunks[chunkIndex][fileIndexInChunk];
  };

  // Use this if obfuscating:
  // return btoa(path);
  getFileHash = (path: string): string => path;

  getChunkFileIsIn = (path: string): number =>
    this.lookup.findIndex((sub) => sub.includes(this.getFileHash(path)));

  getFileIndexInChunk = (chunk: number, path: string): number =>
    this.lookup[chunk].indexOf(this.getFileHash(path));

  getFileIndex = (path: string): number =>
    this.lookup.findIndex((sub) => sub.includes(this.getFileHash(path)));

  fileExists = (path: string): boolean =>
    this.lookup.findIndex((sub) => sub.includes(this.getFileHash(path))) > -1;

  /**
   * @description Adds a new path to the end of the lookup subtable if it's not already
   * full, or appends it to the last entry in the table otherwise.
   * 
   * @param {string*} path - Used to add a new entry to the lookup subtable, either by
   * creating a new table if it does not exist or by adding a new entry to an existing
   * one.
   */
  addToEndOfLookup = (path: string) => {
    // If the last lookup subtable is full, create a new one
    if (
      this.lookup.length === 0 ||
      this.lookup[this.lookup.length - 1].length === this.CHUNK_SIZE
    ) {
      this.lookup.push([path]);
    } else {
      this.lookup[this.lookup.length - 1].push(path);
    }
  };
  /**
   * @description Adds new files to the end of existing chunks or creates a new chunk
   * if the last one is full, maintaining a fixed chunk size.
   * 
   * @param {StructuredFile*} file - Used to add a file to the end of a list of chunks.
   */
  addToEndOfChunks = (file: StructuredFile) => {
    // If the last lookup subtable is full, create a new one
    if (
      this.chunks.length === 0 ||
      this.chunks[this.chunks.length - 1].length === this.CHUNK_SIZE
    ) {
      this.chunks.push([file]);
    } else {
      this.chunks[this.chunks.length - 1].push(file);
    }
  };
  /**
   * @description Adds a file to the document store if the file exists and has not
   * already been added. If the file exists, it updates its metadata and adds it to the
   * end of the lookup and chunks lists.
   * 
   * @param {StructuredFile*} file - Used to represent a file that can be added to the
   * content.
   * 
   * @returns {boolean*} 1 if the file was successfully added to the lookup and chunks,
   * and 0 otherwise.
   */
  addFile = (file: StructuredFile): boolean => {
    if (!this.status.chunks) throw Error("Must call .load before adding files");
    if (!file || !file.path) return false;

    if (this.fileExists(file.path)) {
      try {
        this.updateFile(file);
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    }

    this.addToEndOfLookup(file.path);
    this.addToEndOfChunks(file);

    this.content.push(file);
    return true;
  };
  /**
   * @description Updates a file in the store by checking if it exists, loading any
   * necessary chunks, and storing the updated file in the appropriate position within
   * the chunk.
   * 
   * @param {StructuredFile*} file - Used to represent a file within the application's
   * file system, with its path serving as the reference for updating the file's status
   * within the chunks.
   * 
   * @returns {Promise<boolean>*} Ether *true or *false depending on whether the file
   * was successfully updated.
   */
  updateFile = async (file: StructuredFile): Promise<boolean> => {
    if (!this.status.chunks)
      throw Error("Must call .load before updating files");

    if (!file) return false;

    if (!this.fileExists(file.path)) {
      try {
        this.addFile(file);
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    }
    const chunkIndex = this.getChunkFileIsIn(file.path);
    if (chunkIndex === -1) {
      return false;
    }
    if (!this.isChunkLoaded(chunkIndex)) {
      await this.loadChunk(chunkIndex);
    }
    const fileIndexInChunk = this.getFileIndexInChunk(chunkIndex, file.path);
    this.chunks[chunkIndex][fileIndexInChunk] = file;
    this.content[chunkIndex * this.CHUNK_SIZE + fileIndexInChunk] = file;
    return true;
  };
  /**
   * @description Returns an object containing the class's `meta` and `lookup` properties,
   * providing a concise summary of its state.
   * 
   * @returns {Summary*} An object containing two properties: `meta` and `lookup`.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Generates an object containing key-value pairs, where each key
   * corresponds to a chunk of the document and each value is the contents of that chunk.
   * 
   * @returns {Record<string, any>*} An object containing key-value pairs where the
   * keys are string chunk paths and the values are the corresponding chunk of text.
   */
  outputChunks(): Record<string, any> {
    const outputs: Record<string, any> = {};
    for (let i = 0, j = 0; i < this.content.length; i += this.CHUNK_SIZE, j++) {
      const chunk = this.content.slice(i, i + this.CHUNK_SIZE);
      outputs[this.chunkKeyToChunkPath(this.chunkIndexToChunkKey(j))] = chunk;
    }

    return outputs;
  }
}

export default DocumentStore;
