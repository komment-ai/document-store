import { StructuredFile } from "../types/StructuredFile";
import DocumentStore from "../src/";

const NAMESPACE = "duck";

/**
 * @description Resolves a promise containing metadata and lookup information for a
 * mock API endpoint. The metadata includes creation and update timestamps, while the
 * lookup array contains paths to two files in the `src/` directory: `index.js`,
 * `database.js`, and `component/index.js`.
 * 
 * @returns {Object} A meta object containing creation and update timestamps and a
 * list of pipelines, as well as a lookup array with paths to two files and one
 * directory in the src directory.
 */
const mockSummary = () =>
  Promise.resolve({
    meta: {
      created_at: "2024-04-08T13:50:02.790Z",
      updated_at: "2024-04-08T13:50:02.790Z",
      pipelines: ["cd1d3bab-03db-494c-9e03-16ee456964fb"],
    },
    lookup: [["src/index.js", "src/database.js"], ["src/component/index.js"]],
  });

/**
 * @description Takes a chunk path as input and returns a resolved promise of either
 * the mock summary or a file from the chunks array depending on the chunk path provided.
 * 
 * @param {string} chunkPath - Used to determine which mock file to return based on
 * its path relative to the namespace prefix.
 * 
 * @returns {Promise} Resolved with either a mock summary or one of the chunks.
 */
const getFileMock = (chunkPath: string) => {
  switch (chunkPath) {
    case `.${NAMESPACE}/${NAMESPACE}.json`:
      return Promise.resolve(mockSummary());
    case `.${NAMESPACE}/00000.json`:
      return Promise.resolve(chunks()["00000"]);
    case `.${NAMESPACE}/00001.json`:
      return Promise.resolve(chunks()["00001"]);
    default:
      return Promise.resolve(mockSummary());
  }
};

/**
 * @description Returns an array of objects, each representing a file or directory
 * within a project. The objects contain information about the file's name, path, and
 * content, including a description.
 * 
 * @returns {Object} An array of objects representing files and their contents. Each
 * object in the array has three properties: name, path, and content, where content
 * is a JSON object containing a string value representing the file's contents.
 */
const chunks = () => ({
  "00000": [
    {
      name: "mock-1",
      path: "src/index.js",
      content: {
        description: "duck",
      },
    },
    {
      name: "mock-2",
      path: "src/database.js",
      content: {
        description: "duckDB",
      },
    },
  ],
  "00001": [
    {
      name: "mock-3",
      path: "src/component/index.js",
      content: {
        description: "Component Duck",
      },
    },
  ],
});

const newFileToAdd: StructuredFile = {
  name: "mock-4",
  path: "src/component/added.js",
  content: {
    description: "Additional duck",
  },
};
const fileToUpdate: StructuredFile = {
  name: "mock-5",
  path: "src/component/added.js",
  content: {
    description: "Updated duck",
  },
};

describe("DocumentStore", () => {
  // Tests various features of a DocumentStore.

  test("creates an empty DocumentStore", () => {
    // Creates an instance of `DocumentStore` and calls its `outputSummary()` method,
    // which returns a summary of the document store's contents.

    const newDocumentStore = new DocumentStore(NAMESPACE, () =>
      Promise.resolve({}),
    );
    const summary = newDocumentStore.outputSummary();
    expect(summary.lookup.length).toBe(0);
  });
  test("sets the summary file path based on namespace", () => {
    // Creates a new instance of `DocumentStore`, passing the namespace as an argument,
    // and resolves a promise to obtain the chunk summary path based on the namespace.

    const newDocumentStore = new DocumentStore(NAMESPACE, () =>
      Promise.resolve({}),
    );
    const summaryPath = newDocumentStore.getChunkSummaryPath();
    expect(summaryPath).toBe(".duck/duck.json");
  });
  test("loads a summary file", async () => {
    // Loads a summary file and returns a summary object containing two items in its
    // `lookup` property.

    const newDocumentStore = new DocumentStore(NAMESPACE, mockSummary, {
      pipelines: [],
    });

    await newDocumentStore.loadSummary();
    const summary = newDocumentStore.outputSummary();
    expect(summary.lookup.length).toBe(2);
  });
  test("loads all chunks", async () => {
    // 1) creates a new instance of `DocumentStore`, 2) sets its chunk size to 2, and 3)
    // loads all chunks using the `load()` method, after which it verifies that both the
    // summary and output chunks contain two elements each.

    const newDocumentStore = new DocumentStore(NAMESPACE, getFileMock, {
      pipelines: [],
    });

    newDocumentStore.CHUNK_SIZE = 2;

    await newDocumentStore.load();

    // Verify it loaded the summary
    const summary = newDocumentStore.outputSummary();
    expect(summary.lookup.length).toBe(2);

    // Verify the chunks are loaded correctly
    const outputChunks = newDocumentStore.outputChunks();
    expect(Object.keys(outputChunks).length).toBe(2);
  });
  test("get file content by path", async () => {
    // 1) creates a new instance of `DocumentStore`, 2) sets the chunk size to 2, and 3)
    // retrieves the file at the specified path ("src/database.js") using the `getFile()`
    // method.

    const newDocumentStore = new DocumentStore(NAMESPACE, getFileMock, {
      pipelines: [],
    });

    newDocumentStore.CHUNK_SIZE = 2;

    await newDocumentStore.load();
    const fileToGet = "src/database.js";
    const retrievedFile = await newDocumentStore.getFile(fileToGet);
    expect(retrievedFile?.path).toBe(fileToGet);
  });
  test("error is thrown if load isn't called before file access", async () => {
    // * Creates a new instance of `DocumentStore` with a mock `getFile` method.
    // * Calls the `getFile` method on the `DocumentStore` instance with the file path "src/index.js".
    // * Expects an error to be thrown due to the absence of the `load` method call before
    // accessing the file.

    const newDocumentStore = new DocumentStore(NAMESPACE, getFileMock, {
      pipelines: [],
    });

    expect(
      async () => await newDocumentStore.getFile("src/index.js"),
    ).rejects.toThrow(Error);
  });
  test("add a new file to the store", async () => {
    // Adds a new file to a store and retrieves it back for verification.

    const newDocumentStore = new DocumentStore(NAMESPACE, getFileMock, {
      pipelines: [],
    });
    newDocumentStore.CHUNK_SIZE = 2;

    await newDocumentStore.load();
    newDocumentStore.addFile(newFileToAdd);

    const fileToGet = newFileToAdd.path;
    const retrievedFile = await newDocumentStore.getFile(fileToGet);

    expect(retrievedFile?.path).toBe(fileToGet);
  });
  test("updating a non-existent file adds it to the store", async () => {
    // 1) creates a new `DocumentStore` instance, 2) sets its `CHUNK_SIZE` to a specific
    // value, and 3) updates an existing file using the `updateFile()` method, followed
    // by retrieving the file using the `getFile()` method and verifying its path.

    const newDocumentStore = new DocumentStore(NAMESPACE, getFileMock, {
      pipelines: [],
    });
    newDocumentStore.CHUNK_SIZE = 2;

    await newDocumentStore.load();
    newDocumentStore.updateFile(newFileToAdd);

    const fileToGet = newFileToAdd.path;
    const retrievedFile = await newDocumentStore.getFile(fileToGet);

    expect(retrievedFile?.path).toBe(fileToGet);
  });
  test("update an existing file in the store", async () => {
    // 1) creates a new instance of `DocumentStore`, 2) sets properties on that instance,
    // and 3) updates an existing file in the store by providing the same path but different
    // content description.

    const newDocumentStore = new DocumentStore(NAMESPACE, getFileMock, {
      pipelines: [],
    });
    newDocumentStore.CHUNK_SIZE = 2;

    await newDocumentStore.load();
    newDocumentStore.addFile(newFileToAdd);

    // Update file with the same path but different content.description
    newDocumentStore.updateFile(fileToUpdate);

    const retrievedFile = await newDocumentStore.getFile(fileToUpdate.path);

    expect(retrievedFile?.content.description).toBe(
      fileToUpdate.content.description,
    );
  });
  test("adding an existing file updates it in the store", async () => {
    // Updates an existing file in a document store by adding new content and verifying
    // if the updated file's description matches the expected value.

    const newDocumentStore = new DocumentStore(NAMESPACE, getFileMock, {
      pipelines: [],
    });
    newDocumentStore.CHUNK_SIZE = 2;

    await newDocumentStore.load();
    newDocumentStore.addFile(newFileToAdd);

    // Update file with the same path but different content.description
    newDocumentStore.addFile(fileToUpdate);

    const retrievedFile = await newDocumentStore.getFile(fileToUpdate.path);

    expect(retrievedFile?.content.description).toBe(
      fileToUpdate.content.description,
    );
  });
});
