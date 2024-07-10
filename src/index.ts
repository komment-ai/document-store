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
 * @description Organizes and stores structured files, facilitating high-quality
 * documentation for code. It manages chunk loading, updates status, and provides
 * methods for adding, updating, and retrieving files.
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
   * @description Sets up instance variables for namespace, getRemote method, chunk
   * size, and various metadata properties, including version number, creation and
   * update dates, and custom metadata templates.
   * 
   * @param {string} namespace - Required for initializing an instance of the class.
   * It represents the name of the namespace where the remote data will be stored or
   * retrieved from.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>} getRemote - Required for
   * the constructor to run successfully.
   * 
   * @param {Record<string, any>} additionalMeta - An optional field to provide additional
   * metadata for the document.
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
   * with the provided `Date`.
   * 
   * @param {Date} updated_at - Used to update the metadata's updated_at field.
   * 
   * @returns {void} The result of updating the `meta` object's `updated_at` property
   * with the provided `Date`.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Retrieves and updates the summary information for the document store,
   * including the chunk list and meta data, based on the remote summary information available.
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
      // Assigns the value of `summary.meta![key]` to `this.meta[key]` if present, otherwise
      // assigns the value of `value`.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Of the `DocumentStore` class loads chunks of data asynchronously based
   * on the chunk indices stored in the `lookup` map.
   * 
   * @returns {void} Indicative of the fact that it does not return any value after execution.
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
   * @description Updates the metadata of an object by combining its current metadata
   * with additional metadata provided as an argument.
   * 
   * @param {Record<string, any>} additionalMeta - Added to the existing metadata object
   * 'meta' of the class.
   * 
   * @returns {Recordstring} An augmented version of the current `meta` object with
   * additional metadata provided as the argument `additionalMeta`.
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
   * @description Of the `DocumentStore` class asynchronously loads a chunk of documents
   * from the remote storage and adds them to the local content, updating the chunk
   * cache and the content array.
   * 
   * @param {number} chunkIndex - Representing an index of a chunk to be loaded from a
   * remote location.
   * 
   * @returns {Promiseboolean} True if the chunk is loaded successfully, and false otherwise.
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
   * @description In the `DocumentStore` class allows for retrieval of a file from a
   * specified path, checking the file's existence and loading it from a chunk if necessary.
   * 
   * @param {string} path - Used to specify the path of the file to be retrieved.
   * 
   * @returns {StructuredFile} Either null or a reference to a file within a specified
   * chunk if it exists.
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
   * @description Updates the lookup subtable of a `DocumentStore` instance based on
   * the provided path, appending to the end of the table if necessary.
   * 
   * @param {string} path - Used to insert a new path into the lookup subtable.
   * 
   * @returns {array} An array of strings containing the new path added to the end of
   * the lookup subtable.
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
   * @description In the `DocumentStore` class adds files to the end of chunks based
   * on file size and chunk capacity, creating new chunks when necessary.
   * 
   * @param {StructuredFile} file - Passed to the function for inclusion in the chunks.
   * 
   * @returns {StructuredFile} A new StructuredFile object that contains the file added
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
   * @description Of `DocumentStore` allows adding a file to the collection of stored
   * files. It checks if the file exists and if the `status.chunks` property is set
   * before adding it to the end of the lookup table and chunks list. If the file already
   * exists, it updates its information instead of adding it again.
   * 
   * @param {StructuredFile} file - Used to represent a file to be added to the content
   * of the object.
   * 
   * @returns {boolean} True when a file is successfully added to the content and false
   * otherwise.
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
   * if it exists, loading any necessary chunks, and storing the updated file in the
   * appropriate chunk index.
   * 
   * @param {StructuredFile} file - Passed as an argument to the function for updating
   * a file.
   * 
   * @returns {Promiseboolean} Ether true or false depending on whether the file was
   * updated successfully or not.
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
   * the `DocumentStore` instance.
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
   * @description Generates and returns a record of chunks extracted from a document
   * store's content, using a specified chunk size and keying scheme.
   * 
   * @returns {Recordstring} An object with keys that correspond to chunk paths and
   * values that are chunks of the original content.
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
