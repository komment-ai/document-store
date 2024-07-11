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
 * @description Stores and manages structured files for generating high-quality
 * documentation. It loads and organizes content, handles chunking and summary creation,
 * and provides methods for updating and querying the document store.
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
   * @description Sets up the class with a required namespace and getRemote method,
   * initializes instance variables for chunk size, namespace, getRemote, metadata, and
   * lookup arrays, and sets status to false for summary and chunks.
   * 
   * @param {string} namespace - Required, it represents the namespace for the document
   * store.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>} getRemote - Required for
   * constructing the chunker instance.
   * 
   * @param {Record<string, any>} additionalMeta - Used to store any additional metadata
   * required by the function.
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
   * @description Updates the `updated_at` metadata for the document.
   * 
   * @param {Date} updated_at - Used to update the `updated_at` metadata of an entity.
   * 
   * @returns {void} The result of updating the `meta` object's `updated_at` property
   * with the provided `Date`.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Retrieves and updates a summary of documents stored in the store,
   * including meta-data and chunk information.
   * 
   * @returns {Summary} An object containing metadata and chunk information.
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
      // Assigns values to meta object properties, using either
      // the provided `summary.meta` object or the default value.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Asynchronous loads chunks of data from an index, updating the
   * `status.chunks` property to indicate successful loading.
   * 
   * @returns {void} Indicative that it does not have a return statement.
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
   * @description Updates the metadata field of the class by merging the existing
   * metadata with an additional metadata object.
   * 
   * @param {Record<string, any>} additionalMeta - Used to add additional metadata to
   * the function's meta data.
   * 
   * @returns {Recordstring} An immutable object containing the updated metadata data.
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
   * @description Async loads a chunk of data from a remote source and concats it with
   * the existing content of the class, updating the internal chunks array.
   * 
   * @param {number} chunkIndex - Used to reference the specific chunk being loaded,
   * with values ranging from 0 to the total number of chunks - 1.
   * 
   * @returns {Promiseboolean} True if the chunk was successfully loaded and false otherwise.
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
   * @description Retrieves a file from storage based on its path, loading the necessary
   * chunks if not already loaded. It then returns the file index within the chunk.
   * 
   * @param {string} path - Used to specify the file path to be loaded.
   * 
   * @returns {StructuredFile} Either null if it's not a valid file path or a reference
   * to a StructuredFile object containing information about the file located in the
   * specified chunk and index within that chunk.
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
   * @description Updates the lookup subtable by adding new path to the end or creating
   * a new subtable if the last one is full.
   * 
   * @param {string} path - The path to be added to the end of the lookup subtable.
   * 
   * @returns {string} The new path added to the end of the lookup table.
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
   * @description Manages the chunks of a structured file, adding new files to the end
   * of an existing chunk or creating a new one if the last one is full.
   * 
   * @param {StructuredFile} file - Represented by an object containing various properties
   * related to the file being processed, such as its name, size, and content.
   * 
   * @returns {StructuredFile} A new chunk containing the given file if the last lookup
   * subtable is full, otherwise it adds the file to the end of the previous chunk.
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
   * @description Allows adding a file to the document store if the file exists and the
   * status has chunks, otherwise it throws an error.
   * 
   * @param {StructuredFile} file - Passed to the function as an argument.
   * 
   * @returns {boolean} 1 if the file was added successfully and 0 otherwise.
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
   * @description Updates a file in the store by checking if it exists, loading the
   * chunk if necessary, and storing the updated file index in the chunk.
   * 
   * @param {StructuredFile} file - Passed to the function for updating.
   * 
   * @returns {Promiseboolean} True if the file was successfully updated and false otherwise.
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
   * @description Returns an object containing the class's `meta` and `lookup` properties.
   * 
   * @returns {Summary} An object containing `meta` and `lookup`.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Generates and returns a record of chunks extracted from a larger
   * document, keyed by chunk path.
   * 
   * @returns {Recordstring} A collection of key-value pairs where each key is a unique
   * identifier for a chunk of content and the corresponding value is the actual chunk
   * of content.
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
