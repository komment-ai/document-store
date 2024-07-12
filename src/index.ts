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
 * @description Stores and manages code documentation, providing an interface for
 * loading, updating, and querying the content.
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
   * @description Sets up various properties and variables required to store and manage
   * documents, including the namespace, getRemote method, meta data, and chunk-related
   * parameters.
   * 
   * @param {string} namespace - Required for the construction of the Document Store
   * constructor. It represents the unique name or identifier of the document store,
   * which can be used to differentiate it from other document stores in a given environment.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>} getRemote - Used to retrieve
   * data remotely.
   * 
   * @param {Record<string, any>} additionalMeta - Used to provide additional metadata
   * for the document, such as version number or creation date.
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
   * @description Updates the `updated_at` metadata field of an object, by setting it
   * to the provided `Date` value.
   * 
   * @param {Date} updated_at - Used to update the `updated_at` metadata of an object.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Retrieves and updates the summary data for the documents stored in
   * the local store, using remote information if available.
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
      // Updates the `this.meta` object's property values based on
      // the `summary.meta` object and an optional default value.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Retrieves and loads chunks of data from the storage, based on their
   * indices, and sets the `chunks` property to `true`.
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
   * @param {Record<string, any>} additionalMeta - Used to add or update metadata for
   * the component.
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
   * @description Loads a chunk of the document from the server and adds it to the
   * document's content and chunks array if successful.
   * 
   * @param {number} chunkIndex - Used to represent the index of the chunk being loaded,
   * which serves as a reference for checking if the chunk has already been loaded or
   * not.
   * 
   * @returns {Promise<boolean>} Resolved when the chunk is loaded successfully, and
   * rejected when there is an error.
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
   * @description Retrieves a file from the store based on its path, checking if it is
   * already loaded and returning it if found, or loading it if necessary.
   * 
   * @param {string} path - Used to represent the file path that needs to be retrieved.
   * 
   * @returns {Promise<StructuredFile | null>} A promise that resolves to a StructuredFile
   * object or null if the file is not found in the specified chunk.
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
   * @description Updates the lookup subtable based on the provided path. If the last
   * subtable is full, create a new one; otherwise, append the path to the existing subtable.
   * 
   * @param {string} path - Intended to represent a path to add to the end of the lookup
   * table.
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
   * @description Adds a new file to the end of an array of chunks if the last one is
   * full or if the current chunk is not full, and pushes it to the appropriate position
   * in the chunk array.
   * 
   * @param {StructuredFile} file - Passed to add a file to an array of files, called
   * chunks, within a larger data structure.
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
   * @description Adds a file to the collection of stored files. It first checks if the
   * `status.chunks` property is set and if the input file exists at its path. If so,
   * it updates the file in the collection and returns `true`. Otherwise, it appends
   * the file to the end of the lookup table and chunks list and returns `true`.
   * 
   * @param {StructuredFile} file - Used to represent a file that is being added to the
   * content library.
   * 
   * @returns {boolean} `true` if the file was successfully added to the content, and
   * `false` otherwise.
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
   * @description Updates a file in the store by checking if it exists, loading it if
   * necessary, and storing it in the appropriate chunk and index position.
   * 
   * @param {StructuredFile} file - Used to represent a file that needs to be updated
   * or added to the content library.
   * 
   * @returns {Promise<boolean>} Whether the file was updated successfully or not.
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
   * @description Returns an object containing `meta` and `lookup` properties, which
   * are presumably used to summarize or represent the contents of the document store.
   * 
   * @returns {Summary} An object consisting of two properties: `meta` and `lookup`.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Generates an object with chunk-related metadata and content for each
   * chunk in the document. The method iterates through the document's content, slices
   * it into chunks, and assigns a unique identifier to each chunk.
   * 
   * @returns {Record<string, any>} An object where each key is a chunk path and the
   * corresponding value is the contents of that chunk.
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
