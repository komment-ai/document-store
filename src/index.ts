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
 * @description Is responsible for managing and storing a collection of structured
 * files (e.g., JSON documents) with metadata and file lookup functionality. It allows
 * for efficient loading, updating, and retrieval of files, as well as generating
 * summaries and chunking the content for storage or transmission.
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
   * @description Initializes an instance with a namespace, a getRemote method, and
   * optional additional metadata. It sets default properties, validates input, and
   * creates internal state (meta, lookup, chunks, content, and status). The constructor
   * ensures that the namespace and getRemote method are provided.
   * 
   * @param {string*} namespace - Required to be passed. It represents the namespace
   * for which the constructor initializes its internal state.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>*} getRemote - Required for
   * constructor initialization. It returns a promise that resolves to an object with
   * properties of any type when invoked with zero or more arguments.
   * 
   * @param {Record<string, any>*} additionalMeta - Used to initialize an object that
   * holds additional metadata for the namespace.
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
   * effectively setting the updated timestamp for the document.
   * 
   * @param {Date*} updated_at - Assigned to `this.meta.updated_at`. It represents the
   * date when the data was last updated.
   * 
   * @returns {unction} An instance method that sets the property `updated_at` of the
   * object's metadata (`meta`).
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Loads and updates the document summary from a remote source, storing
   * it locally if available. If no data is retrieved, it initializes an empty summary
   * with default values. It then sets local metadata fields based on the loaded or
   * default summary values.
   * 
   * @returns {asynchronous} A `Promise` that resolves to an object of type `Summary`.
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
      // Maps metaTemplate keys to their corresponding values.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Asynchronously loads and prepares data for display by checking if
   * summary exists, loading it if not, and then retrieving specific chunks based on
   * lookup indices, ultimately setting the `chunks` status to true upon completion.
   * 
   * @returns {asynchronous} An undefined state indicating that it has started execution
   * and is still running.
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
   * object provided as an argument, allowing for dynamic modification and extension
   * of metadata properties.
   * 
   * @param {Record<string, any>*} additionalMeta - Defined to represent an object with
   * key-value pairs where keys are strings and values can be of any data type. It holds
   * additional metadata information that needs to be updated in the current metadata
   * object.
   * 
   * @returns {ƒunction} Ƒ an object where the properties are merged from the current
   * metadata (`this.meta`) and additional metadata (`additionalMeta`).
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
   * concatenates it with the existing content, and stores it in the `chunks` object.
   * If an error occurs during loading, it returns `false`.
   * 
   * @param {number*} chunkIndex - Required for the asynchronous chunk loading process.
   * It represents an index that uniquely identifies a chunk of data to be loaded from
   * a remote location.
   * 
   * @returns {Promiseboolean} Resolved to either true or false.
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
   * @description Asynchronously retrieves a file from storage, given its path. It first
   * checks if the document summary has been loaded and then loads the corresponding
   * chunk and file index if necessary, before returning the requested file or null if
   * it doesn't exist.
   * 
   * @param {string*} path - Required for calculating the chunk it is in and file index
   * within that chunk, which are used to access the structured file or return null if
   * not found or not loaded.
   * 
   * @returns {PromiseStructuredFile} Either a `StructuredFile` object or null.
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
   * @description Adds a new path to the end of the last lookup subtable if it is not
   * full, or creates a new one if the previous one is full. It uses an array of arrays
   * (lookup) to store paths in chunks of size CHUNK_SIZE.
   * 
   * @param {string*} path - Required for the function to work properly. It represents
   * a path that needs to be added to the lookup table.
   * 
   * @returns {unction} To be used as an event handler for adding a new path to the end
   * of the lookup subtable.
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
   * @description Adds a file to the end of an existing chunk or creates a new chunk
   * if the current one is full, according to the predefined `CHUNK_SIZE`. It modifies
   * the internal state of the object by updating its `chunks` property.
   * 
   * @param {StructuredFile*} file - Expected to be an object or value that represents
   * a file, but its exact structure and content are not specified.
   * 
   * @returns {undefined} Implicit since there are no explicit statements that assign
   * a value to it.
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
   * @description Adds a file to the store if it meets certain conditions. The file
   * must have a path and not exist already, or be updated successfully if it does. The
   * method returns a boolean indicating success or failure.
   * 
   * @param {StructuredFile*} file - Required to be not null. It represents a file that
   * needs to be added to the content, specified by its path.
   * 
   * @returns {boolean*} True if a file was successfully added and false otherwise.
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
   * @description Asynchronously updates a file within a document's chunks, adding it
   * if it does not exist. If the chunk is not loaded, it loads it first. The method
   * returns a boolean indicating success or failure of the update operation.
   * 
   * @param {StructuredFile*} file - Required for updating files.
   * 
   * @returns {Promiseboolean} Resolved to either `true` or `false`, indicating whether
   * the file update operation was successful or failed respectively.
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
   * populated from the instance variables `this.meta` and `this.lookup`, respectively.
   * This method provides a summary representation of the document store's metadata and
   * lookup data.
   * 
   * @returns {Summary*} An object with two properties: meta and lookup, both inherited
   * from this object.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Splits its content into chunks, converts each chunk to a string, and
   * stores them in a record as key-value pairs where keys are generated using the
   * `chunkKeyToChunkPath` function. The method returns this record.
   * 
   * @returns {Recordstring} An object containing a set of key-value pairs. Each key
   * corresponds to a string path and each value corresponds to a chunk of content from
   * the original data.
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
