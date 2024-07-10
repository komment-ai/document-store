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
 * @description Manages and organizes structured files into chunks, providing a way
 * to load, update, and retrieve files from a remote data source while maintaining
 * metadata about the files and their organization.
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
   * @description Initializes an instance with provided namespace, getRemote method,
   * and optional additional metadata. It sets default properties like CHUNK_SIZE,
   * updates metadata template, creates empty lists for lookup, chunks, content, and
   * status, and validates required inputs.
   * 
   * @param {string*} namespace - Required, as indicated by the error thrown if it is
   * not provided. It specifies the namespace for the constructed object.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>*} getRemote - Required, which
   * means it should be provided when calling this function. It returns a promise that
   * resolves to an object containing any number of key-value pairs.
   * 
   * @param {Record<string, any>*} additionalMeta - Passed to create or update metadata
   * for the namespace.
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
   * @description Updates the `updated_at` property of the `meta` object within an
   * instance of the `DocumentStore` class with the specified `updated_at` Date value.
   * This update operation sets the timestamp for when the document was last updated.
   * 
   * @param {Date*} updated_at - Assigned to the `updated_at` property of an object's
   * meta attribute.
   * 
   * @returns {void} Indicating that it does not return any specific value.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Loads or generates a document summary from a remote source and updates
   * the local summary metadata. If no remote data is available, it creates an empty
   * summary. The method then sets the local document store's version, creation date,
   * and update date accordingly.
   * 
   * @returns {void} Effectively a null response as it does not explicitly return any
   * value from its execution path.
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
      // Maps object entries to meta properties.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Asynchronously loads summary data and chunk indices from the `lookup`
   * array. It then loads corresponding chunks using the `loadChunk` method, setting
   * the `chunks` property to `true` once complete.
   * 
   * @returns {void} Denoted by its absence of explicit return statement.
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
   * @description Updates the metadata object by merging additional metadata with the
   * existing metadata. This method takes an object `additionalMeta` as input and assigns
   * it to the `meta` property of the class, overwriting any duplicate keys.
   * 
   * @param {Record<string, any>*} additionalMeta - Expected to be an object containing
   * metadata key-value pairs. This object will be merged with the existing `this.meta`
   * object.
   * 
   * @returns {void} An empty value that does not have any specific type.
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
   * @description Asynchronously loads a chunk of structured files from a remote location,
   * concatenates it with the existing content, and stores it in a cache. If loading
   * fails, it returns false; otherwise, it returns true.
   * 
   * @param {number*} chunkIndex - Used as an index to identify specific chunks, likely
   * referring to their position or order within a larger dataset.
   * 
   * @returns {Promise<boolean>*} Resolved to either true or false, indicating whether
   * the chunk was successfully loaded or an error occurred during loading.
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
   * @description Asynchronously retrieves a file from a structured storage, ensuring
   * that the summary has been loaded and the necessary chunk is available. It calculates
   * the chunk index and checks if the chunk is loaded; if not, it loads the chunk
   * before returning the requested file.
   * 
   * @param {string*} path - Required for the function to calculate the chunk it belongs
   * to, retrieve the file index within that chunk and verify the correctness of the
   * chunk/lookup before returning the requested file.
   * 
   * @returns {Promise<StructuredFile | null>*} Either a structured file object if the
   * file exists or null if it does not.
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
   * @description Adds a path to the end of the lookup table. If the last subtable is
   * full, it creates a new one; otherwise, it appends the path to the existing subtable.
   * The lookup table stores paths and ensures efficient retrieval of related documents.
   * 
   * @param {string*} path - Required for method execution.
   * 
   * @returns {void} Indicating that it does not return any value.
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
   * @description Adds a file to the end of a chunk in an array of chunks, ensuring
   * that each chunk does not exceed a specified size (`CHUNK_SIZE`). If the last chunk
   * is full, it creates a new one.
   * 
   * @param {StructuredFile*} file - Implied to be an instance of the StructuredFile
   * class, representing a structured file or chunk.
   * 
   * @returns {void} Equivalent to nothing or undefined.
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
   * @description Adds a structured file to the `DocumentStore` instance, checking if
   * the document is already present and updating it if necessary. If not, it appends
   * the file path to lookup and chunks lists, and pushes the file to content array.
   * 
   * @param {StructuredFile*} file - Required for adding files to the object's content.
   * It represents an instance of a structured file that has a path property, which is
   * checked before attempting to add the file.
   * 
   * @returns {boolean*} True if a file is successfully added and false otherwise.
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
   * @description Updates a file in the document store. It checks if the file exists,
   * loads the corresponding chunk if necessary, and replaces the old file with the new
   * one. The method returns a boolean indicating success or failure of the update operation.
   * 
   * @param {StructuredFile*} file - Required to be non-null. If null, the function
   * returns false.
   * 
   * @returns {Promise<boolean>*} A promise that resolves to a boolean value. The boolean
   * indicates whether the file was successfully updated (true) or not (false).
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
   * @description Returns an object containing two properties, `meta` and `lookup`,
   * with values taken from the `this.meta` and `this.lookup` attributes respectively,
   * of the `DocumentStore` class. The returned object is a summary representation of
   * the document store's metadata and lookup information.
   * 
   * @returns {Summary*} An object containing two properties: meta and lookup.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Divides the content into chunks based on the `CHUNK_SIZE`, generates
   * corresponding chunk keys, and stores these chunks in a record with their respective
   * keys as property names. The method returns this record containing all output chunks.
   * 
   * @returns {Record<string, any>*} A mapping from string keys to arbitrary values.
   * The returned record contains chunked data stored in the `outputs` object, where
   * each key corresponds to a unique chunk identifier.
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
