import fs from 'fs';
import yaml from 'yaml';

interface ObjectArray {
    [key: string]: any;
}

export function encodeJSON(data: any, key: string): Buffer {
    const stringedData = JSON.stringify(data);
    let objArray: any | ObjectArray = stringedData;
    objArray = JSON.parse(objArray);
    const buffer: number[] = [];

    const encodeString = (str: string, key: string): string => {
        let encodedStr = '';
        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            encodedStr += String.fromCharCode(charCode);
        }
        return encodedStr;
    };

    if (!Array.isArray(objArray)) {
        const stringData = objArray = Object.values(objArray);

        objArray = JSON.stringify(stringData, null, 2);
    }

    for (const obj of objArray) {
        const objBuffer: number[] = [];

        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                objBuffer.push(key.length);
                objBuffer.push(...Buffer.from(key));

                if (typeof obj[key] === 'string') {
                    objBuffer.push(0); // String type
                    const encodedStr = encodeString(obj[key], key);
                    const valueLength = Buffer.alloc(4);
                    valueLength.writeInt32BE(encodedStr.length, 0);
                    objBuffer.push(...valueLength);
                    objBuffer.push(...Buffer.from(encodedStr));
                } else if (typeof obj[key] === 'number') {
                    objBuffer.push(1); // Number type
                    const numValue = Buffer.alloc(4);
                    numValue.writeInt32BE(obj[key], 0);
                    objBuffer.push(...numValue);
                } else if (typeof obj[key] === 'boolean') {
                    objBuffer.push(2); // Boolean type
                    objBuffer.push(obj[key] ? 1 : 0);
                } else if (Array.isArray(obj[key])) {
                    objBuffer.push(3); // Array type
                    const arrayValue = JSON.stringify(obj[key]);
                    const encodedArrayValue = encodeString(arrayValue, key);
                    const valueLength = Buffer.alloc(4);
                    valueLength.writeInt32BE(encodedArrayValue.length, 0);
                    objBuffer.push(...valueLength);
                    objBuffer.push(...Buffer.from(encodedArrayValue));
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    objBuffer.push(4); // Object type
                    const objectValue = JSON.stringify(obj[key]);
                    const encodedObjectValue = encodeString(objectValue, key);
                    const valueLength = Buffer.alloc(4);
                    valueLength.writeInt32BE(encodedObjectValue.length, 0);
                    objBuffer.push(...valueLength);
                    objBuffer.push(...Buffer.from(encodedObjectValue));
                } else if (obj[key] === null) {
                    objBuffer.push(5); // Null type
                }
            }
        }

        buffer.push(objBuffer.length);
        buffer.push(...objBuffer);
    }

    return Buffer.from(buffer);
}

export function decodeJSON(fileName: string, key: string): object[] | null {
    try {
        const buffer: Buffer = fs.readFileSync(fileName);
        const objArray: object[] = [];
        let offset: number = 0;

        const decodeString = (str: string, key: string): string => {
            let decodedStr = '';
            for (let i = 0; i < str.length; i++) {
                const charCode = str.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                decodedStr += String.fromCharCode(charCode);
            }
            return decodedStr;
        };

        while (offset < buffer.length) {
            const objLength: number = buffer.readUInt8(offset);
            offset++;

            const objBuffer: Buffer = buffer.subarray(offset, offset + objLength);
            const obj: ObjectArray = {};

            let objOffset: number = 0;
            while (objOffset < objBuffer.length) {
                const keyLength: number = objBuffer.readUInt8(objOffset);
                objOffset++;

                const key: string = objBuffer.toString('utf8', objOffset, objOffset + keyLength);
                objOffset += keyLength;

                const valueType: number = objBuffer.readUInt8(objOffset);
                objOffset++;

                let value: any;
                if (valueType === 0) { // String type
                    const valueLength: number = objBuffer.readUInt32BE(objOffset);
                    objOffset += 4;
                    const encodedValue: string = objBuffer.toString('utf8', objOffset, objOffset + valueLength);
                    value = decodeString(encodedValue, key);
                    objOffset += valueLength;
                } else if (valueType === 1) { // Number type
                    value = objBuffer.readInt32BE(objOffset);
                    objOffset += 4;
                } else if (valueType === 2) { // Boolean type
                    value = objBuffer.readUInt8(objOffset) === 1;
                    objOffset++;
                } else if (valueType === 3) { // Array type
                    const valueLength: number = objBuffer.readUInt32BE(objOffset);
                    objOffset += 4;
                    const encodedValue: string = objBuffer.toString('utf8', objOffset, objOffset + valueLength);
                    value = JSON.parse(decodeString(encodedValue, key));
                    objOffset += valueLength;
                } else if (valueType === 4) { // Object type
                    const valueLength: number = objBuffer.readUInt32BE(objOffset);
                    objOffset += 4;
                    const encodedValue: string = objBuffer.toString('utf8', objOffset, objOffset + valueLength);
                    value = JSON.parse(decodeString(encodedValue, key));
                    objOffset += valueLength;
                } else if (valueType === 5) { // Null type
                    value = null;
                }

                obj[key] = value;
            }

            objArray.push(obj);

            offset += objLength;
        }

        return objArray;
    } catch (error: any) {
        return null;
    }
}

function encrypt(data: Buffer, key: string): Buffer {
    const keyBuffer = Buffer.from(key);
    for (let i = 0; i < data.length; i++) {
        data[i] ^= keyBuffer[i % keyBuffer.length];
    }
    return data;
}

function decrypt(data: Buffer, key: string): Buffer {
    return encrypt(data, key);
}

export function encodeYAML(yamlData: any, key: string): Buffer {
    const yamlString = yaml.stringify(yamlData);
    const data = yaml.parse(yamlString);
    const stringFiedData = yaml.stringify(data);
    const compressedData = Buffer.from(stringFiedData, 'utf-8');
    return encrypt(compressedData, key);
}

export function decodeYAML(filePath: string, key: string): any {
    try {
        const buffer = fs.readFileSync(filePath);
        if (buffer.length === 0) {
            return [];
        }
        const decryptedData = decrypt(buffer, key);
        const yamlData = decryptedData.toString('utf-8');
        return yaml.parse(yamlData);
    } catch (error: any) {
        return null;
    }
}
export function encodeSQL(data: string, key: string): string {
    let compressedEncodedData = '';
    let count = 1;
    for (let i = 0; i < data.length; i++) {
        if (data[i] === data[i + 1]) {
            count++;
        } else {
            compressedEncodedData += count + data[i];
            count = 1;
        }
    }

    let encodedData = '';
    for (let i = 0; i < compressedEncodedData.length; i++) {
        const charCode = compressedEncodedData.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        encodedData += String.fromCharCode(charCode);
    }

    return encodedData;
}

export function decodeSQL(encodedData: string, key: string): any {
  try {
    let decodedData = '';
    for (let i = 0; i < encodedData.length; i++) {
        const charCode = encodedData.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        decodedData += String.fromCharCode(charCode);
    }

    let decompressedData = '';
    let i = 0;
    while (i < decodedData.length) {
        const count = parseInt(decodedData[i]);
        const char = decodedData[i + 1];
        decompressedData += char.repeat(count);
        i += 2;
    }

    return decompressedData;
  } catch (error: any) {
    return null
  }
}