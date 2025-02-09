import StormDB from "stormdb";
import { createDataStore } from "../src/services/dataStore";
import fs from "fs";
import { promisify } from "util";

const mkdtemp = promisify(fs.mkdtemp);
const readFile = promisify(fs.readFile);
const rmdir = promisify(fs.rmdir);

describe("Data Store", () => {
  let path: string;

  beforeEach(async () => {
    path = await mkdtemp("/tmp/cognito-local:");
  });

  afterEach(() =>
    rmdir(path, {
      recursive: true,
    })
  );

  it("creates a named database", async () => {
    await createDataStore("example", {}, path);

    expect(fs.existsSync(path + "/example.json")).toBe(true);
  });

  it("creates a named database with the defaults persisted", async () => {
    await createDataStore("example", { DefaultValue: true }, path);

    expect(fs.existsSync(path + "/example.json")).toBe(true);

    const file = JSON.parse(await readFile(path + "/example.json", "utf-8"));
    expect(file).toEqual({
      DefaultValue: true,
    });
  });

  it("saves the default objects when a save occurs", async () => {
    const dataStore = await createDataStore(
      "example",
      { DefaultValue: true },
      path
    );

    await dataStore.set("key", 1);

    const file = JSON.parse(await readFile(path + "/example.json", "utf-8"));
    expect(file).toEqual({
      DefaultValue: true,
      key: 1,
    });
  });

  describe("delete", () => {
    it("deletes a value", async () => {
      const dataStore = await createDataStore("example", {}, path);

      await dataStore.set("key1", 1);
      await dataStore.set("key2", 2);

      const fileBefore = JSON.parse(
        await readFile(path + "/example.json", "utf-8")
      );

      expect(fileBefore).toEqual({
        key1: 1,
        key2: 2,
      });

      await dataStore.delete("key1");

      const fileAfter = JSON.parse(
        await readFile(path + "/example.json", "utf-8")
      );

      expect(fileAfter).toEqual({
        key2: 2,
      });
    });

    it("deletes a nested value using array syntax", async () => {
      const dataStore = await createDataStore("example", {}, path);

      await dataStore.set(["key", "a", "b"], 1);
      await dataStore.set(["key", "a", "c"], 2);
      await dataStore.set("key2", 3);

      const fileBefore = JSON.parse(
        await readFile(path + "/example.json", "utf-8")
      );

      expect(fileBefore).toEqual({
        key: {
          a: {
            b: 1,
            c: 2,
          },
        },
        key2: 3,
      });

      await dataStore.delete(["key", "a", "b"]);

      const fileAfter = JSON.parse(
        await readFile(path + "/example.json", "utf-8")
      );

      expect(fileAfter).toEqual({
        key: {
          a: {
            c: 2,
          },
        },
        key2: 3,
      });
    });
  });

  describe("set", () => {
    it("saves a value", async () => {
      const dataStore = await createDataStore("example", {}, path);

      await dataStore.set("key1", 1);
      await dataStore.set("key2", 2);

      const file = JSON.parse(await readFile(path + "/example.json", "utf-8"));

      expect(file).toEqual({
        key1: 1,
        key2: 2,
      });
    });

    it("saves a date value", async () => {
      const dataStore = await createDataStore("example", {}, path);

      const date = new Date();

      await dataStore.set("SomethingDate", date);

      const file = JSON.parse(await readFile(path + "/example.json", "utf-8"));

      expect(file).toEqual({
        SomethingDate: date.toISOString(),
      });
    });

    it("fails to save a date value with the wrong type", async () => {
      const dataStore = await createDataStore("example", {}, path);

      const date = new Date();

      await expect(
        dataStore.set("SomethingDate", date.getTime())
      ).rejects.toEqual(
        new Error(
          "Serialize: Expected SomethingDate field to contain a Date, received a number"
        )
      );
    });

    it("saves a nested value using array syntax", async () => {
      const dataStore = await createDataStore("example", {}, path);

      await dataStore.set(["key", "a", "b"], 1);

      const file = JSON.parse(await readFile(path + "/example.json", "utf-8"));

      expect(file).toEqual({
        key: {
          a: {
            b: 1,
          },
        },
      });
    });

    it("saves a key with dots in as a single key-value pair", async () => {
      const dataStore = await createDataStore("example", {}, path);

      await dataStore.set("key.a.b", 1);

      const file = JSON.parse(await readFile(path + "/example.json", "utf-8"));

      expect(file).toEqual({
        "key.a.b": 1,
      });
    });

    it("replaces a value", async () => {
      const dataStore = await createDataStore("example", {}, path);

      await dataStore.set("key", 1);

      let file = JSON.parse(await readFile(path + "/example.json", "utf-8"));

      expect(file).toEqual({
        key: 1,
      });

      await dataStore.set("key", 2);

      file = JSON.parse(await readFile(path + "/example.json", "utf-8"));

      expect(file).toEqual({
        key: 2,
      });
    });
  });

  describe("getRoot", () => {
    it("returns entire db", async () => {
      const dataStore = await createDataStore(
        "example",
        { DefaultValue: true },
        path
      );

      await dataStore.set("key", "value");

      const result = await dataStore.getRoot();

      expect(result).toEqual({ DefaultValue: true, key: "value" });
    });
  });

  describe("get", () => {
    it("returns a default", async () => {
      const dataStore = await createDataStore(
        "example",
        { DefaultValue: true },
        path
      );

      const result = await dataStore.get("DefaultValue");

      expect(result).toEqual(true);
    });

    it("returns null if key doesn't exist", async () => {
      const dataStore = await createDataStore("example", {}, path);

      const result = await dataStore.get("invalid");

      expect(result).toBeNull();
    });

    it("returns existing value", async () => {
      const dataStore = await createDataStore("example", {}, path);

      await dataStore.set("key", 1);

      const result = await dataStore.get("key");

      expect(result).toEqual(1);
    });

    it("returns a date value", async () => {
      const dataStore1 = await createDataStore("example", {}, path);

      const date = new Date();

      await dataStore1.set("SomethingDate", date);

      // use a separate datastore to avoid caching
      const dataStore2 = await createDataStore("example", {}, path);
      const result = await dataStore2.get("SomethingDate");

      expect(result).toEqual(date);
    });

    it("returns a date value stored as a number", async () => {
      // write the date as number directly with Storm, to avoid our validation of Date types
      const engine = new StormDB.localFileEngine(`${path}/example.json`, {
        async: true,
      });
      const db = new StormDB(engine);

      const date = new Date();

      db.set("SomethingDate", date.getTime());
      await db.save();

      const dataStore = await createDataStore("example", {}, path);
      const result = await dataStore.get("SomethingDate");

      expect(result).toEqual(date);
    });
  });
});
