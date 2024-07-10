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
 * @description Provides a structured way of storing and retrieving code documentation,
 * including files, chunks, and metadata. It offers features like loading high-quality
 * summaries, updating metadata, and generating records of chunks.
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
   * @description Establishes instance variables and sets default values for them. It
   * also validates inputs, such as ensuring that `namespace` and `getRemote` are
   * provided, and initializes objects to store metadata and chunks of data.
   * 
   * @param {string} namespace - Required to initialize an instance of the class. It
   * represents the name of the application or project for which the code is being generated.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>} getRemote - Required for
   * calling the remote data retrieval method.
   * 
   * @param {Record<string, any>} additionalMeta - Used to provide additional metadata
   * for the document store.
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
   * @description Updates the `updated_at` metadata field of the `DocumentStore` instance
   * by assigning the provided `Date` object directly to the `meta` object within the
   * method body.
   * 
   * @param {Date} updated_at - Used to update the metadata for the entity.
   * 
   * @returns {void} The result of updating the `meta` object's `updated_at` property
   * with the provided `Date`.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Retrieves and updates the document store's summary metadata from the
   * remote source, and assigns it to the local `summary` object.
   * 
   * @returns {Summary} An object with properties `meta`, `lookup`, and `chunks`.
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
      // * Iterates over the entries of an object `this.metaTemplate` using Object.entries()
      // * For each entry, it checks if there is a corresponding key in the `summary.meta`
      // object or default value is set by providing `value`
      // * If a key-value pair is found in `summary.meta`, the value is assigned to `this.meta[key]`
      // * Otherwise, the default value is assigned to `this.meta[key]`

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Of the `DocumentStore` class asynchronously loads the summary and
   * chunks of a document, setting `status.summary` and `status.chunks` to `true` upon
   * completion.
   * 
   * @returns {void} Indicative of a function that does not return any values.
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
   * @description Updates the metadata of an object by merging the existing metadata
   * with additional metadata provided as an argument.
   * 
   * @param {Record<string, any>} additionalMeta - An object that contains additional
   * metadata to be merged with the current metadata associated with the object.
   * 
   * @returns {Recordstring} An immutable object containing a combination of the existing
   * metadata and the additional metadata passed as argument.
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
   * @description Of the `DocumentStore` class loads a chunk of data from a remote
   * source and stores it in the object's internal state. If the chunk is already loaded,
   * it returns `true`. Otherwise, it returns `false` after adding the chunk to the
   * object's internal state.
   * 
   * @param {number} chunkIndex - Used to identify the specific chunk being loaded.
   * 
   * @returns {Promiseboolean} True when the chunk is successfully loaded and False otherwise.
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
   * @description Retrieves a file from a store based on its path, calculating the chunk
   * it is located in and loading the chunk if necessary. It then returns the file
   * within that chunk.
   * 
   * @param {string} path - Used to specify the file path being searched for.
   * 
   * @returns {StructuredFile} Either a file or null if it does not exist or cannot be
   * accessed.
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
   * @description In the `DocumentStore` class adds a new path to the end of a lookup
   * table if necessary, ensuring that the last subtable is not full and has enough
   * space for additional entries.
   * 
   * @param {string} path - Used to add a new subtable to the existing lookup table.
   * 
   * @returns {array} An augmented list of path.
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
   * @description Adds a file to the end of an array of files stored in chunks, creating
   * a new chunk if necessary to avoid exceeding the maximum size.
   * 
   * @param {StructuredFile} file - Passed as an argument to the function.
   * 
   * @returns {StructuredFile} A new StructuredFile object containing the file added
   * to the end of the chunks array.
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
   * @description Of the `DocumentStore` class allows adding a new file to the document
   * store, checking for file existence and proper loading order before updating the
   * content and pushing the file to the end of the `content` array.
   * 
   * @param {StructuredFile} file - Used to represent a file that can be added to the
   * content array of the object.
   * 
   * @returns {boolean} True when the file is successfully added to the content and
   * False otherwise.
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
   * @description Of the `DocumentStore` class updates a file in the store by checking
   * if it exists, loading the chunk if necessary, and storing the file in the chunk.
   * It returns a boolean indicating whether the update was successful.
   * 
   * @param {StructuredFile} file - Passed to update the file content in the Chunk.
   * 
   * @returns {Promiseboolean} True if the file was updated successfully and false otherwise.
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
   * @description Returns an object containing the `meta` and `lookup` properties of
   * the current instance of the `DocumentStore` class.
   * 
   * @returns {Summary} An object containing two properties: `meta` and `lookup`.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Of `DocumentStore` takes the contents of the document and splits it
   * into chunks, storing each chunk in a map with a unique key based on its position
   * in the document.
   * 
   * @returns {Recordstring} An object that maps string keys to any values.
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
