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
 * @description Manages a collection of files (code chunks) and provides methods to
 * load, update, and retrieve files from the store. It maintains metadata about the
 * files, ensures chunking for efficient storage and retrieval, and offers output
 * methods for generating documentation and extracting code records.
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
   * @description Initializes an instance with required properties such as namespace,
   * getRemote method, and additional metadata. It also sets default values for other
   * properties like CHUNK_SIZE, lookup array, chunks array, content array, and status
   * object.
   * 
   * @param {string*} namespace - Required to be set.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>*} getRemote - Intended to
   * retrieve data remotely.
   * 
   * @param {Record<string, any>*} additionalMeta - Used to provide additional metadata
   * information.
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
   * @description Updates the `updated_at` property of its instance with the provided
   * `updated_at` date. This method modifies the internal state of the object, updating
   * the timestamp indicating when the document was last updated.
   * 
   * @param {Date*} updated_at - Used to update the value of the `updated_at` property.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Loads and updates the summary data from a remote source or uses a
   * local template if no data is available, then applies the loaded data to its own
   * properties and sets a status flag indicating whether a summary is loaded.
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
      // Assigns default values to object properties.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Loads and initializes document data. If the summary is not loaded,
   * it calls `loadSummary()`. Then, it looks up chunk indices and loads corresponding
   * chunks using `loadChunk()` method. Finally, it sets the `chunks` property to `true`.
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
   * @description Updates the metadata object by merging it with an additional metadata
   * record. The resulting metadata object is assigned back to the instance property
   * `meta`. This allows for incremental modification of the metadata over time.
   * 
   * @param {Record<string, any>*} additionalMeta - Intended to provide additional
   * metadata for updating.
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
   * @description Loads a chunk of structured files from a remote location, checks if
   * it's already loaded, and updates the local state with the new data. If an error
   * occurs during loading, it returns false; otherwise, it returns true.
   * 
   * @param {number*} chunkIndex - Used to identify the chunk to load from remote storage.
   * 
   * @returns {Promise<boolean>*} Resolved to either true or false.
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
   * @description Asynchronously retrieves a file with the given path from an array of
   * chunks, loading the chunk if necessary and checking its integrity. It returns the
   * file object or null if it does not exist.
   * 
   * @param {string*} path - Used to specify a file path.
   * 
   * @returns {Promise<StructuredFile | null>*} Either a StructuredFile object or null.
   * If the file exists and is successfully loaded, it returns the StructuredFile object;
   * otherwise, it returns null.
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
   * @description Adds paths to the last lookup subtable or creates a new one if it's
   * full, maintaining a fixed chunk size (`CHUNK_SIZE`). It ensures efficient storage
   * and retrieval of document paths in a hierarchical structure.
   * 
   * @param {string*} path - Used to add to the end of the lookup table.
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
   * @description Adds a file to the last lookup subtable if it's not full, or creates
   * a new one if the current table is full. It maintains an array of chunks with a
   * fixed size and keeps track of the files within each chunk.
   * 
   * @param {StructuredFile*} file - Intended to be appended at the end of chunks.
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
   * @description Adds a structured file to the store. If the file already exists, it
   * updates its content; otherwise, it appends it to the end of the lookup and chunks
   * arrays, and pushes it into the content array.
   * 
   * @param {StructuredFile*} file - Used to add files to the system.
   * 
   * @returns {boolean*} True if a file has been successfully added to the collection
   * and false otherwise.
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
   * @description Updates a structured file with a given path. It checks if the file
   * exists and loads the corresponding chunk if necessary. If successful, it replaces
   * the old file content with the new one in both chunk and content arrays.
   * 
   * @param {StructuredFile*} file - Intended to update an existing file.
   * 
   * @returns {Promise<boolean>*} A promise that resolves to either true or false
   * indicating whether the file update operation was successful or not.
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
   * @description Returns an object containing two properties: `meta` and `lookup`.
   * This summary likely represents a condensed version of the document's metadata and
   * lookup information, facilitating efficient retrieval or display of key data.
   * 
   * @returns {Summary*} An object containing two properties: `meta` and `lookup`, both
   * having values inherited from the instance properties `this.meta` and `this.lookup`.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Splits its internal content into fixed-size chunks, maps each chunk
   * to a unique key using the `chunkIndexToChunkKey` and `chunkKeyToChunkPath` methods,
   * and returns a record containing these key-value pairs.
   * 
   * @returns {Record<string, any>*} An object where keys are strings and values can
   * be of any data type, representing a mapping between chunk keys and corresponding
   * chunks of content.
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
