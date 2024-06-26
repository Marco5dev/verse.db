export interface JSONAdapter {
  load(dataname: string): Promise<any[]>;
  add(dataname: string, newData: any, options?: any): Promise<void>;
  find(dataname: string, query: any, options?: any, loadedData?: any[]): Promise<any[]>;
  loadAll(dataname: string, displayOptions?: any, loadedData?: any[]): Promise<void>;
  remove(dataname: string, query: any, options?: any, loadedData?: any[]): Promise<void>;
  update(dataname: string, query: any, newData: any, loadedData?: any[]): Promise<void>;
  updateMany(dataname: any, queries: any[any], newData: operationKeys, loadedData?: any[]): Promise<void>;
  drop(dataname: string): Promise<void>;
  nearbyVectors(data: nearbyOptions): Promise<void>
  polygonArea(polygonCoordinates: any): Promise<void>;
  bufferZone(geometry: any, bufferDistance: any): Promise<void>;
  search(collectionFilters: CollectionFilter[]): Promise<SearchResult>;
  countDoc(dataname: string): Promise<any>;
  dataSize(dataname: string): Promise<any>;
  batchTasks(operation: any[]): Promise<any>;
  aggregate(dataname: string, pipeline: any[]): Promise<any>;
  moveData(from: string, to: string, options: { query?: any, dropSource?: boolean }): Promise<any>;
  model(dataname: string, schema: any): any;
}
export interface YAMLAdapter {
  load(dataname: string): Promise<any[]>;
  add(dataname: string, newData: any, options?: any): Promise<void>;
  find(dataname: string, query: any, options?: any, loadedData?: any[]): Promise<any[]>;
  loadAll(dataname: string, displayOptions?: any, loadedData?: any[]): Promise<void>;
  remove(dataname: string, query: any, options?: any, loadedData?: any[]): Promise<void>;
  update(dataname: string, query: any, newData: any, loadedData?: any[]): Promise<void>;
  updateMany(dataname: any, queries: any[any], newData: operationKeys, loadedData?: any[]): Promise<void>;
  drop(dataname: string): Promise<void>;
  nearbyVectors(data: nearbyOptions): Promise<void>
  polygonArea(polygonCoordinates: any): Promise<void>;
  bufferZone(geometry: any, bufferDistance: any): Promise<void>;
  search(collectionFilters: CollectionFilter[]): Promise<SearchResult>;
  countDoc(dataname: string): Promise<any>;
  dataSize(dataname: string): Promise<any>;
  batchTasks(operation: any[]): Promise<any>;
  moveData(from: string, to: string, options: { query?: any, dropSource?: boolean }): Promise<any>;
  model(dataname: string, schema: any): any;
}
export interface SQLAdapter {
  load(dataname: string): Promise<void>;
  createTable(
    dataname: string,
    tableName: string,
    tableDefinition?: string
  ): Promise<void>;
  insertData(dataname: string, tableName: string, data: any[]): Promise<void>;
  find(dataname: string, tableName: string, condition?: string): Promise<void>;
  removeData(
    dataname: string,
    tableName: string,
    dataToRemove: any[]
  ): Promise<void>;
  update(
    dataname: string,
    tableName: string,
    query: string,
    newData: any,
    upsert: boolean
  ): Promise<void>;
  loadAll(dataname: string, displayOption: DisplayOptions): Promise<void>;
  updateMany(
    dataname: string,
    tableName: string,
    queries: any[],
    newData: operationKeys
  ): Promise<void>;
  drop(dataname: string, tableName?: string): Promise<void>;
  countDoc(dataname: string, tableName: string): Promise<void>;
  dataSize(dataname: string): Promise<void>;
  migrateTable({ from, to, table }: MigrationParams): Promise<void>;
  removeKey(
    dataname: string,
    tableName: string,
    keyToRemove: string,
    valueToRemove: string
  ): Promise<void>;
  toJSON(from: string): Promise<void>;
  tableCount({
    dataname,
    query,
  }: {
    dataname: string;
    query?: { [key: string]: string };
  }): Promise<any>;
  join(dataname: string, searchOptions: { table: string; query: string }[], displayOptions?: searchFilters): Promise<void>
}

export interface DevLogsOptions {
  enable: boolean;
  path: string;
}

export interface SecureSystem {
  enable: boolean;
  secret: string;
}

export interface BackupOptions {
  enable?: boolean;
  path: string;
  password?: string;
  retention: number;
}

export interface AdapterOptions {
  adapter: string;
  adapterType?: string | null;
  dataPath: string;
  devLogs?: DevLogsOptions;
  secure?: SecureSystem;
  backup?: BackupOptions;
}

export interface CollectionFilter {
  dataname: string;
  displayment: number | null;
  filter?: any;
}

export interface SearchResult {
  [key: string]: any[];
}

export interface DisplayOptions {
  filters?: Record<string, any>;
  sortOrder?: "asc" | "desc";
  page: number;
  pageSize: number;
  displayment?: number | null;
  groupBy?: string;
}
export interface MigrationParams {
  from: string;
  to: string;
  table: string;
}

export interface operationKeys {
  $set?: { [key: string]: any };
  $unset?: { [key: string]: any };
  $push?: { [key: string]: any };
  $pull?: { [key: string]: any };
  $addToSet?: { [key: string]: any };
  $rename?: { [key: string]: string };
  $min?: { [key: string]: any };
  $max?: { [key: string]: any };
  $mul?: { [key: string]: number };
  $inc?: { [key: string]: number };
  $bit?: { [key: string]: any };
  $currentDate?: { [key: string]: boolean | { $type: 'date' | 'timestamp' }};
  $pop?: { [key: string]: number };
  $slice?: { [key: string]: [number, number] | number };
  $sort?: { [key: string]: 1 | -1 };
}

export interface nearbyOptions {
  dataName: string;
  point: {
      latitude: number;
      longitude: number;
  };
  radius: number;
  visitedVectors?: Set<any>;
}
export interface searchFilters {
  groupBy?: { column: string };
  page?: number;
  pageSize?: number;
  sortOrder?: 'asc' | 'desc';
  displayment?: number | null;
}

export interface queries<T> {
  $and?: queries<T>[];
  $or?: queries<T>[];
  $validate?: (value: T) => boolean;
  $text?: string;
  $sort?: 1 | -1;
  $slice?: number | [number, number];
  $some?: boolean;
  $gt?: number;
  $lt?: number;
  $nin?: T[];
  $exists?: boolean;
  $not?: queries<T>;
  $in?: T[];
  $elemMatch?: queries<T>;
  $typeOf?: string | 'string' | 'number' | 'boolean' | 'undefined' | 'array' | 'object' | 'null' | 'any';
  $regex?: string;
  $size?: number;
}

export type Query<T> = {
  [P in keyof T]?: T[P] | queries<T[P]>;
};

export interface QueryOptions {
  $skip?: number;
  $limit?: number;
  $project?: { [key: string]: boolean };
}