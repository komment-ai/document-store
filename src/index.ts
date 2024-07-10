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
   * @description Sets up an instance of a class for generating high-quality documentation
   * for given code. It takes the namespace, getRemote method, additional meta data,
   * and sets properties for chunk size, namespace, getRemote method, meta data, and status.
   * 
   * @param {string} namespace - name of the code repository or module that the constructor
   * belongs to.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>} getRemote - Promise function
   * that retrieves data from a remote source and returns it as a Record object.
   * 
   * @param {Record<string, any>} additionalMeta - metadata that should be included in
   * the documentation, such as version number, creation and update dates, and any
   * additional fields specified by the caller.
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
   * @description Updates the `updated_at` metadata for an object by assigning the
   * provided `updated_at` value to the `meta` object's `updated_at` property.
   * 
   * @param {Date} updated_at - timestamp when the metadata was last updated, and it
   * is assigned to the `meta.updated_at` property within the function.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Retrieves a summary document from the remote Document Store, updates
   * the local `meta` object with the retrieved information, and stores it in the local
   * `lookup`.
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
      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Loads chunks of data from an API, given a lookup table and a status
   * object. It initializes the status object's summary property if it is not already
   * set and then iterates over the chunk indices provided by the lookup table and calls
   * the `loadChunk` function for each one to load the corresponding chunk of data.
   * Finally, it sets the `chunks` property of the status object to `true`.
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
   * @param {Record<string, any>} additionalMeta - additional metadata to be combined
   * with the existing meta data of the object, in the `meta` property of the object.
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
   * @description Loads a chunk of data from the remote source, combining it with the
   * local content, and storing it in the `chunks` object. It returns `true` if the
   * chunk was loaded successfully, or `false` otherwise.
   * 
   * @param {number} chunkIndex - 0-based index of a specific chunk within the overall
   * set of chunks being loaded, and is used to determine whether the corresponding
   * chunk has already been loaded and to update the local content and cache accordingly.
   * 
   * @returns {Promise<boolean>} a boolean value indicating whether the chunk was loaded
   * successfully or not.
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
   * @description Retrieves a file from a summary by calculating its chunk index and
   * file index within that chunk, loading the chunk if necessary, and returning the file.
   * 
   * @param {string} path - file path to be looked up in the structured files, and it
   * is used to calculate the chunk index and file index within that chunk.
   * 
   * @returns {Promise<StructuredFile | null>} a `StructuredFile` object representing
   * the file at the specified path within the current summary.
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
   * @description Adds a new path to the end of a lookup subtable if it is full or if
   * the last element of the table is at maximum length.
   * 
   * @param {string} path - subtable index to which the function adds an entry if the
   * last subtable is full or if the entry already exists in the last subtable and
   * exceeds the maximum size allowed.
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
   * @description Adds a file to the end of an array of chunks if the last chunk is
   * full or if the file cannot fit in the current chunk.
   * 
   * @param {StructuredFile} file - file being processed and is added to the appropriate
   * subtable within the `StructuredFile` object's `chunks` array based on whether the
   * last subtable is full or not.
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
   * @description Adds a file to a Structured File instance's content and chunks,
   * checking for file existence and validating the addition process.
   * 
   * @param {StructuredFile} file - file to be added to the StructuredFile instance,
   * providing its path for checking file existence and adding it to the content array
   * if valid.
   * 
   * @returns {boolean} a boolean indicating whether the file was successfully added
   * to the structured file system.
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
   * @description Updates a file in a StructuredFile collection. It checks if the file
   * exists and if it has already been loaded, then it adds the file to the collection
   * if it hasn't been loaded yet, and returns `true`.
   * 
   * @param {StructuredFile} file - file that needs to be updated or added to the
   * structured file, and it is used to check if the file exists, add it to the structured
   * file if it does not exist, and update the contents of the appropriate chunk and
   * file index within the chunk if it already exists.
   * 
   * @returns {Promise<boolean>} a boolean value indicating whether the file was
   * successfully updated or not.
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
   * @description Returns an object containing the metadata (`meta`) and a list of
   * Lookup objects (`lookup`) of the given code.
   * 
   * @returns {Summary} an object containing the `meta` and `lookup` properties of the
   * underlying object.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Generates a Record of chunk objects by slicing the given content into
   * chunks, and mapping each chunk to its corresponding path using a key-value pair.
   * 
   * @returns {Record<string, any>} a Record<string, any> containing key-value pairs
   * representing chunks of the original content.
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
