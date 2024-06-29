import { StructuredFile } from "../types/StructuredFile";
import DocumentStore from "../src/";

const NAMESPACE = "duck";

const mockSummary = () =>
  Promise.resolve({
    meta: {
      created_at: "2024-04-08T13:50:02.790Z",
      updated_at: "2024-04-08T13:50:02.790Z",
      pipelines: ["cd1d3bab-03db-494c-9e03-16ee456964fb"],
    },
    lookup: [["src/index.js", "src/database.js"], ["src/component/index.js"]],
  });

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
  test("creates an empty DocumentStore", () => {
    const newDocumentStore = new DocumentStore(NAMESPACE, () =>
      Promise.resolve({}),
    );
    const summary = newDocumentStore.outputSummary();
    expect(summary.lookup.length).toBe(0);
  });
  test("sets the summary file path based on namespace", () => {
    const newDocumentStore = new DocumentStore(NAMESPACE, () =>
      Promise.resolve({}),
    );
    const summaryPath = newDocumentStore.getChunkSummaryPath();
    expect(summaryPath).toBe(".duck/duck.json");
  });
  test("loads a summary file", async () => {
    const newDocumentStore = new DocumentStore(NAMESPACE, mockSummary, {
      pipelines: [],
    });

    await newDocumentStore.loadSummary();
    const summary = newDocumentStore.outputSummary();
    expect(summary.lookup.length).toBe(2);
  });
  test("loads all chunks", async () => {
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
    const newDocumentStore = new DocumentStore(NAMESPACE, getFileMock, {
      pipelines: [],
    });

    expect(
      async () => await newDocumentStore.getFile("src/index.js"),
    ).rejects.toThrow(Error);
  });
  test("add a new file to the store", async () => {
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
