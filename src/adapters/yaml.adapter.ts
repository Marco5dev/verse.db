import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { logError, logInfo, logSuccess } from "../core/logger";
import { randomUUID } from "../lib/id";
import {
  AdapterOptions,
  AdapterResults,
  AdapterUniqueKey,
  versedbAdapter,
  CollectionFilter,
  SearchResult,
  operationKeys,
} from "../types/adapter";
import yaml from "yaml";
import { DevLogsOptions, AdapterSetting } from "../types/adapter";

export class yamlAdapter extends EventEmitter implements versedbAdapter {
  public devLogs: DevLogsOptions = { enable: false, path: "" };

  constructor(options: AdapterSetting) {
    super();
    this.devLogs = options.devLogs;

    if (this.devLogs.enable && !this.devLogs.path) {
      logError({
        content: "You need to provide a logs path if devlogs is true.",
        devLogs: this.devLogs,
      });
      throw new Error("You need to provide a logs path if devlogs is true.");
    }
  }

  async load(dataname: string): Promise<any[]> {
    try {
      let data: string | undefined;
      try {
        data = fs.readFileSync(dataname, "utf8");
      } catch (error: any) {
        if (error.code === "ENOENT") {
          logInfo({
            content: "Data or file path to YAML is not found.",
            devLogs: this.devLogs,
          });

          this.initFile({ dataname: dataname });
        } else {
          logError({
            content: error,
            devLogs: this.devLogs,
            throwErr: true,
          });
        }
      }
      if (!data) {
        data = "[]";
      }
      return yaml.parse(data);
    } catch (e: any) {
      logError({
        content: `Error loading data from /${dataname}: ${e}`,
        devLogs: this.devLogs,
      });

      throw new Error(e);
    }
  }

  async add(
    dataname: string,
    newData: any,
    options: AdapterOptions = {}
  ): Promise<AdapterResults> {
    try {
      let currentData: any[] = (await this.load(dataname)) || [];

      if (typeof currentData === "undefined") {
        return {
          acknowledged: false,
          errorMessage: `Error loading data.`,
        };
      }

      if (!newData || (Array.isArray(newData) && newData.length === 0)) {
        return {
          acknowledged: false,
          errorMessage: `Either no data given to add or data to add is empty.`,
        };
      }

      if (!Array.isArray(newData)) {
        newData = [newData];
      }

      const flattenedNewData = newData.flatMap((item: any) => {
        if (Array.isArray(item)) {
          return item;
        } else {
          return [item];
        }
      });

      const duplicates = flattenedNewData.some((newItem: any) =>
        currentData.some((existingItem: any) =>
          options.uniqueKeys?.every((key: AdapterUniqueKey) => {
            if (
              Array.isArray(existingItem[key.key]) &&
              Array.isArray(newItem[key.key])
            ) {
              return (
                yaml.stringify(existingItem[key.key].sort()) ===
                yaml.stringify(newItem[key.key].sort())
              );
            } else {
              return (
                existingItem.hasOwnProperty(key.key) &&
                newItem.hasOwnProperty(key.key) &&
                existingItem[key.key] === newItem[key.key]
              );
            }
          })
        )
      );

      if (duplicates) {
        return {
          acknowledged: false,
          errorMessage: `Duplicate data detected. Addition aborted.`,
        };
      }

      currentData.push(
        ...flattenedNewData.map((item: any) => ({ _id: randomUUID(), ...item }))
      );

      fs.writeFileSync(dataname, yaml.stringify(currentData), "utf8");

      logSuccess({
        content: "Data has been added",
        devLogs: this.devLogs,
      });

      flattenedNewData.forEach((item: any) => this.emit("dataAdded", item));

      return {
        acknowledged: true,
        message: "Data added successfully.",
      };
    } catch (e: any) {
      this.emit("error", e.message);

      return {
        acknowledged: false,
        errorMessage: `${e.message}`,
      };
    }
  }

  private indexes: Map<string, Map<string, number[]>> = new Map();

  private async createIndexesIfNotExists(dataname: string): Promise<void> {
    if (!this.indexes.has(dataname)) {
      const currentData: any[] = await this.load(dataname);
      const indexMap = new Map<string, number[]>();
      currentData.forEach((item, index) => {
        Object.keys(item).forEach((key) => {
          const value = item[key];
          if (!indexMap.has(key)) {
            indexMap.set(key, []);
          }
          indexMap.get(key)?.push(index);
        });
      });
      this.indexes.set(dataname, indexMap);
    }
  }

  async find(dataname: string, query: any): Promise<AdapterResults> {
    try {
      if (!query) {
        return {
          acknowledged: false,
          results: null,
          errorMessage: "Query isn't provided.",
        };
      }

      await this.createIndexesIfNotExists(dataname);
      const indexMap = this.indexes.get(dataname);
      if (!indexMap) {
        return {
          acknowledged: true,
          results: null,
          message: "No data found matching your query.",
        };
      }

      const currentData: any[] = await this.load(dataname);
      const candidateIndexes = Object.keys(query)
        .map(
          (key) =>
            indexMap
              .get(key)
              ?.filter((idx) => currentData[idx][key] === query[key]) || []
        )
        .flat();

      for (const idx of candidateIndexes) {
        const item = currentData[idx];
        let match = true;
        for (const key of Object.keys(query)) {
          if (item[key] !== query[key]) {
            match = false;
            break;
          }
        }
        if (match) {
          this.emit("dataFound", item);
          return {
            acknowledged: true,
            results: item,
            message: "Found data matching your query.",
          };
        }
      }

      return {
        acknowledged: true,
        results: null,
        message: "No data found matching your query.",
      };
    } catch (e: any) {
      this.emit("error", e.message);

      return {
        acknowledged: false,
        results: null,
        errorMessage: `${e.message}`,
      };
    }
  }

  async loadAll(
    dataname: string,
    displayOptions: any
  ): Promise<AdapterResults> {
    try {
      const currentData: any[] = await this.load(dataname);

      if (!displayOptions || Object.keys(displayOptions).length === 0) {
        return {
          acknowledged: false,
          results: null,
          errorMessage: "You need to provide at least one option argument.",
        };
      }

      let filteredData = currentData;

      if (displayOptions.filters) {
        filteredData = currentData.filter((item: any) => {
          for (const key of Object.keys(displayOptions.filters)) {
            if (item[key] !== displayOptions.filters[key]) {
              return false;
            }
          }
          return true;
        });
      }

      if (displayOptions.sortBy && displayOptions.sortBy !== "any") {
        filteredData.sort((a: any, b: any) => {
          if (displayOptions.sortOrder === "asc") {
            return a[displayOptions.sortBy] - b[displayOptions.sortBy];
          } else {
            return b[displayOptions.sortBy] - a[displayOptions.sortBy];
          }
        });
      } else {
        filteredData.sort((a: any, b: any) => a - b);
      }

      const startIndex = (displayOptions.page - 1) * displayOptions.pageSize;
      const endIndex = Math.min(
        startIndex + displayOptions.pageSize,
        filteredData.length
      );
      filteredData = filteredData.slice(startIndex, endIndex);

      if (
        displayOptions.displayment !== null &&
        displayOptions.displayment > 0
      ) {
        filteredData = filteredData.slice(0, displayOptions.displayment);
      }

      this.emit("allData", filteredData);

      return {
        acknowledged: true,
        message: "Data found with the given options.",
        results: filteredData,
      };
    } catch (e: any) {
      this.emit("error", e.message);

      return {
        acknowledged: false,
        errorMessage: `${e.message}`,
        results: null,
      };
    }
  }

  async remove(
    dataname: string,
    query: any,
    options?: { docCount: number }
  ): Promise<AdapterResults> {
    try {
      if (!query) {
        return {
          acknowledged: false,
          errorMessage: `Query is not provided`,
          results: null,
        };
      }

      const currentData: any[] = await this.load(dataname);

      let removedCount = 0;
      let matchFound = false;

      for (let i = 0; i < currentData.length; i++) {
        const item = currentData[i];
        let match = true;

        for (const key of Object.keys(query)) {
          if (item[key] !== query[key]) {
            match = false;
            break;
          }
        }

        if (match) {
          currentData.splice(i, 1);
          removedCount++;

          if (removedCount === options?.docCount) {
            break;
          }

          i--;
          matchFound = true;
        }
      }

      if (!matchFound) {
        return {
          acknowledged: true,
          errorMessage: `No document found matching the query.`,
          results: null,
        };
      }

      fs.writeFileSync(dataname, yaml.stringify(currentData), "utf8");

      logSuccess({
        content: "Data has been removed",
        devLogs: this.devLogs,
      });

      this.emit("dataRemoved", query, options?.docCount);

      return {
        acknowledged: true,
        message: `${removedCount} document(s) removed successfully.`,
        results: null,
      };
    } catch (e: any) {
      this.emit("error", e.message);

      return {
        acknowledged: false,
        errorMessage: `${e.message}`,
        results: null,
      };
    }
  }

  async update(
    dataname: string,
    queries: any,
    newData: operationKeys,
    upsert: boolean = false
  ) {
    try {
      if (!queries) {
        return {
          acknowledged: false,
          errorMessage: `Search query is not provided`,
          results: null,
        };
      }

      if (!newData) {
        return {
          acknowledged: false,
          errorMessage: `New data is not provided`,
          results: null,
        };
      }

      const currentData: any[] = await this.load(dataname);

      let updatedCount = 0;
      let updatedDocument: any = null;
      let matchFound = false;

      for (let index of currentData.keys()) {
        const item: any = currentData[index];
        let match = true;

        for (const key of Object.keys(queries)) {
          if (item[key] !== queries[key]) {
            match = false;
            break;
          }
        }

        if (match) {
          // Process special $ operations
          if (newData.$inc) {
            for (const field in newData.$inc) {
              item[field] = (item[field] || 0) + newData.$inc[field];
            }
          }
          if (newData.$set) {
            for (const field in newData.$set) {
              item[field] = newData.$set[field];
            }
          }
          if (newData.$push) {
            for (const field in newData.$push) {
              if (!item[field]) item[field] = [];
              item[field].push(newData.$push[field]);
            }
          }
          if (newData.$min) {
            for (const field in newData.$min) {
              item[field] = Math.min(item[field] || 0, newData.$min[field]);
            }
          }
          if (newData.$max) {
            for (const field in newData.$max) {
              item[field] = Math.max(item[field] || 0, newData.$max[field]);
            }
          }
          if (newData.$currentDate) {
            for (const field in newData.$currentDate) {
              if (
                typeof newData.$currentDate[field] === "boolean" &&
                newData.$currentDate[field]
              ) {
                item[field] = new Date().toISOString();
              } else if (
                newData.$currentDate[field] &&
                (newData.$currentDate[field] as any).$type === "date"
              ) {
                item[field] = new Date().toISOString().slice(0, 10);
              } else if (
                newData.$currentDate[field] &&
                (newData.$currentDate[field] as any).$type === "timestamp"
              ) {
                item[field] = new Date().toISOString();
              }
            }
          }
          break;
        }
      }

      if (!matchFound && upsert) {
        currentData.push(newData);
        updatedDocument = newData;
        updatedCount++;
      }

      if (!matchFound && !upsert) {
        return {
          acknowledged: true,
          errorMessage: `No document found matching the search query.`,
          results: null,
        };
      }

      fs.writeFileSync(dataname, yaml.stringify(currentData), "utf8");

      logSuccess({
        content: "Data has been updated",
        devLogs: this.devLogs,
      });

      this.emit("dataUpdated", updatedDocument);

      return {
        acknowledged: true,
        message: `${updatedCount} document(s) updated successfully.`,
        results: updatedDocument,
      };
    } catch (e: any) {
      this.emit("error", e.message);

      return {
        acknowledged: false,
        errorMessage: `${e.message}`,
        results: null,
      };
    }
  }

  async updateMany(
    dataname: any,
    queries: any[any],
    newData: operationKeys,
    upsert: boolean = false
  ) {
    try {
      if (!queries) {
        return {
          acknowledged: false,
          errorMessage: `Search query is not provided`,
          results: null,
        };
      }

      if (!newData) {
        return {
          acknowledged: false,
          errorMessage: `New data is not provided`,
          results: null,
        };
      }

      const currentData: any[] = await this.load(dataname);

      let updatedCount = 0;
      let updatedDocument: any = null;
      let matchFound = false;

      for (let index of currentData.keys()) {
        const item: any = currentData[index];
        let match = true;

        for (const key of Object.keys(queries)) {
          if (item[key] !== queries[key]) {
            match = false;
            break;
          }
        }

        if (match) {
          // Process special $ operations
          if (newData.$inc) {
            for (const field in newData.$inc) {
              item[field] = (item[field] || 0) + newData.$inc[field];
            }
          }
          if (newData.$set) {
            for (const field in newData.$set) {
              item[field] = newData.$set[field];
            }
          }
          if (newData.$push) {
            for (const field in newData.$push) {
              if (!item[field]) item[field] = [];
              item[field].push(newData.$push[field]);
            }
          }
          if (newData.$min) {
            for (const field in newData.$min) {
              item[field] = Math.min(item[field] || 0, newData.$min[field]);
            }
          }
          if (newData.$max) {
            for (const field in newData.$max) {
              item[field] = Math.max(item[field] || 0, newData.$max[field]);
            }
          }
          if (newData.$currentDate) {
            for (const field in newData.$currentDate) {
              if (
                typeof newData.$currentDate[field] === "boolean" &&
                newData.$currentDate[field]
              ) {
                item[field] = new Date().toISOString();
              } else if (
                newData.$currentDate[field] &&
                (newData.$currentDate[field] as any).$type === "date"
              ) {
                item[field] = new Date().toISOString().slice(0, 10);
              } else if (
                newData.$currentDate[field] &&
                (newData.$currentDate[field] as any).$type === "timestamp"
              ) {
                item[field] = new Date().toISOString();
              }
            }
          }
          break;
        }
      }

      if (!matchFound && upsert) {
        currentData.push(newData);
        updatedDocument = newData;
        updatedCount++;
      }

      if (!matchFound && !upsert) {
        return {
          acknowledged: true,
          errorMessage: `No document found matching the search query.`,
          results: null,
        };
      }

      
      fs.writeFileSync(dataname, yaml.stringify(currentData), "utf8");

      logSuccess({
        content: "Data has been updated",
        devLogs: this.devLogs,
      });

      this.emit("dataUpdated", updatedDocument);

      return {
        acknowledged: true,
        message: `${updatedCount} document(s) updated successfully.`,
        results: updatedDocument,
      };
    } catch (e: any) {
      this.emit("error", e.message);

      return {
        acknowledged: false,
        errorMessage: `${e.message}`,
        results: null,
      };
    }
  }

  async drop(dataname: string): Promise<AdapterResults> {
    try {
      const currentData = this.load(dataname);

      if (Array.isArray(currentData) && currentData.length === 0) {
        return {
          acknowledged: true,
          message: `The file already contains an empty array.`,
          results: null,
        };
      }

      const emptyData: any[] = [];

      fs.writeFileSync(dataname, yaml.stringify(emptyData), "utf8");

      logSuccess({
        content: "Data has been dropped",
        devLogs: this.devLogs,
      });

      this.emit("dataDropped", `Data has been removed from ${dataname}`);

      return {
        acknowledged: true,
        message: `All data dropped successfully.`,
        results: null,
      };
    } catch (e: any) {
      this.emit("error", e.message);

      return {
        acknowledged: false,
        errorMessage: `${e.message}`,
        results: null,
      };
    }
  }

  async search(dataPath: string, collectionFilters: CollectionFilter[]) {
    try {
      const results: SearchResult = {};
      for (const filter of collectionFilters) {
        const { dataname, displayment, filter: query } = filter;
        const filePath = path.join(dataPath, `${dataname}.yaml`);

        const data = await fs.promises.readFile(filePath, "utf-8");
        const yamlData = yaml.parse(data);

        let result = yamlData;

        if (Object.keys(query).length !== 0) {
          result = yamlData.filter((item: any) => {
            for (const key in query) {
              if (item[key] !== query[key]) {
                return false;
              }
            }
            return true;
          });
        }

        if (displayment !== null) {
          result = result.slice(0, displayment);
        }

        results[dataname] = result;
      }

      return {
        acknowledged: true,
        message: "Succefully searched in data for the given query.",
        errorMessage: null,
        results: results,
      };
    } catch (e: any) {
      logError({
        content: e.message,
        devLogs: this.devLogs,
        throwErr: false,
      });

      return {
        acknowledged: true,
        errorMessage: `${e.message}`,
        results: null,
      };
    }
  }

  private applyUpdateToyamlObject(
    newData: operationKeys,
    columns: string[],
    yamlObject: Record<string, any>
  ) {
    if (newData.$inc) {
      for (const field in newData.$inc) {
        if (columns.includes(field)) {
          yamlObject[field] = (yamlObject[field] || 0) + newData.$inc[field];
        }
      }
    }
    if (newData.$set) {
      for (const field in newData.$set) {
        if (columns.includes(field)) {
          yamlObject[field] = newData.$set[field];
        }
      }
    }
    if (newData.$push) {
      for (const field in newData.$push) {
        if (columns.includes(field)) {
          if (!yamlObject[field]) {
            yamlObject[field] = [];
          }
          yamlObject[field].push(newData.$push[field]);
        }
      }
    }
    if (newData.$min) {
      for (const field in newData.$min) {
        if (columns.includes(field)) {
          yamlObject[field] = Math.min(
            yamlObject[field] || 0,
            newData.$min[field]
          );
        }
      }
    }
    if (newData.$max) {
      for (const field in newData.$max) {
        if (columns.includes(field)) {
          yamlObject[field] = Math.max(
            yamlObject[field] || 0,
            newData.$max[field]
          );
        }
      }
    }
    if (newData.$currentDate) {
      for (const field in newData.$currentDate) {
        if (
          typeof newData.$currentDate[field] === "boolean" &&
          newData.$currentDate[field]
        ) {
          yamlObject[field] = new Date().toISOString();
        } else if (
          newData.$currentDate[field] &&
          (newData.$currentDate[field] as any).$type === "date"
        ) {
          yamlObject[field] = new Date().toISOString().slice(0, 10);
        } else if (
          newData.$currentDate[field] &&
          (newData.$currentDate[field] as any).$type === "timestamp"
        ) {
          yamlObject[field] = new Date().toISOString();
        }
      }
    }
  }

  public initFile({ dataname }: { dataname: string }): void {
    const emptyData: any[] = [];
    const directory = path.dirname(dataname);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(dataname, yaml.stringify(emptyData), "utf8");
    logInfo({
      content: `Empty YAML file created at ${dataname}`,
      devLogs: this.devLogs,
    });
  }

  public initDir({ dataFolder }: { dataFolder: string }): void {
    fs.mkdirSync(__dirname + dataFolder, { recursive: true });
    logInfo({
      content: `Empty Direction created at ${dataFolder}`,
      devLogs: this.devLogs,
    });
  }
}
