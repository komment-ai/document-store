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
 * @description Is a data structure designed to efficiently manage and load structured
 * files (e.g., JSON) from remote sources, handling chunking, caching, and lookup
 * operations for fast access and retrieval of file contents.
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
   * @description Initializes an instance by validating required parameters, setting
   * default properties, and creating metadata with version information, timestamps,
   * and additional user-provided data.
   * 
   * @param {string*} namespace - Required. It represents the namespace for this document
   * store instance and is used to identify it uniquely.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>*} getRemote - Required to
   * be provided when constructing an object. It seems to represent a remote method
   * that returns a promise resolving to a dictionary.
   * 
   * @param {Record<string, any>*} additionalMeta - Used to represent additional metadata
   * about the namespace. It contains key-value pairs where keys are strings and values
   * can be of any type.
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
   * @description Updates the `updated_at` property with the provided `Date` object,
   * effectively changing the timestamp when the document was last updated.
   * 
   * @param {Date*} updated_at - Assigned to `this.meta.updated_at`.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Loads and updates metadata and data from a remote source, merging
   * local and remote data. If no data is stored, it logs a message and sets default values.
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
      // Maps metaTemplate properties to meta properties with fallbacks.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Asynchronously loads document summary and chunks when called. It first
   * checks if the summary is loaded, then loads chunks based on the lookup indices.
   * Once all chunks are loaded, it sets the `chunks` status to true.
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
   * @description Updates the metadata object by merging it with additional metadata
   * provided as an argument. It uses the spread operator to combine the existing
   * metadata with the new metadata, resulting in a new updated metadata object.
   * 
   * @param {Record<string, any>*} additionalMeta - Passed as an argument to this function.
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
   * @description Asynchronously loads a chunk of structured files from a remote location
   * if it's not already loaded, and updates the local storage with the new content.
   * It returns a boolean indicating whether the load was successful or not.
   * 
   * @param {number*} chunkIndex - Used as an index for accessing the chunks of data
   * stored in the `chunks` object. It represents the specific chunk to be loaded from
   * the remote location.
   * 
   * @returns {Promise<boolean>*} Resolved to either `true` (if the chunk loading is
   * successful) or `false` (in case of an error).
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
   * @description Asynchronously retrieves a file from storage based on its path,
   * ensuring that the required summary is loaded first and loading the corresponding
   * chunk if necessary.
   * 
   * @param {string*} path - Used to specify the path of the file for which the structured
   * file information should be retrieved.
   * 
   * @returns {Promise<StructuredFile | null>*} Resolved to either a structured file
   * object (of type StructuredFile) or null.
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
   * @description Adds a path to the end of the current lookup subtable if it's not
   * full, otherwise creates a new one. It checks if the last subtable is empty or has
   * reached its chunk size before adding the path.
   * 
   * @param {string*} path - Passed as an argument to the function, which it uses to
   * determine whether to create a new subtable in the `lookup` array or add the path
   * to the last existing subtable.
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
   * @description Adds a `StructuredFile` to either a new or an existing chunk, depending
   * on whether the last chunk is full. It ensures that each chunk does not exceed the
   * specified `CHUNK_SIZE`.
   * 
   * @param {StructuredFile*} file - Required for processing and manipulation within
   * the function.
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
   * @description Adds a file to the store if it exists and its path has not been
   * previously added. If the file already exists, it updates the existing file;
   * otherwise, it appends the new file to the end of the lookup and chunk lists.
   * 
   * @param {StructuredFile*} file - Mandatory for the function to execute successfully.
   * It must be provided with valid data, specifically including a path property.
   * 
   * @returns {boolean*} True if the file was successfully added, and false otherwise.
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
   * @description Updates a file by adding or replacing it in a chunk, if the chunk
   * exists and is loaded. If not loaded, it loads the chunk first. The method returns
   * a boolean indicating success.
   * 
   * @param {StructuredFile*} file - Required for this method. If no file is provided,
   * it returns false immediately.
   * 
   * @returns {Promise<boolean>*} Either a promise that resolves to `true` if the file
   * update operation is successful or `false` otherwise.
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
   * @description Returns an object with two properties, `meta` and `lookup`, which are
   * initialized from the corresponding instance variables `this.meta` and `this.lookup`.
   * The purpose is to provide a compact representation of the document store's metadata
   * and lookup data.
   * 
   * @returns {Summary*} An object with two properties: meta and lookup.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Splits its internal content into chunks, each with a fixed size
   * specified by `CHUNK_SIZE`, and stores them as key-value pairs in a Record object,
   * where keys are generated from chunk indices using `chunkIndexToChunkKey` and `chunkKeyToChunkPath`.
   * 
   * @returns {Record<string, any>*} A collection of key-value pairs where keys are
   * strings and values are of any data type.
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
