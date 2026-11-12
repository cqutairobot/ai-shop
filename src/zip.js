import fs from 'node:fs/promises';
import zlib from 'node:zlib';

/**
 * 一个只做「打包不压缩」的 ZIP 写入器，用于导出备份。
 * 图片本身已经是压缩格式，再压缩没有意义，所以直接原样存入（STORE）。
 * 逐个文件读入并写出，内存占用只取决于最大的单个文件。
 *
 * @param {(chunk: Uint8Array) => Promise<void>} write 把数据块写到输出流
 * @param {{name: string, path: string}[]} files 要打包的文件，name 是压缩包里的路径
 */
export async function writeZip(write, files) {
  const central = [];
  let offset = 0;

  for (const f of files) {
    let data;
    try {
      data = await fs.readFile(f.path);
    } catch {
      continue; // 文件在导出过程中被删掉了，跳过
    }
    const name = Buffer.from(f.name, 'utf8');
    const crc = zlib.crc32(data);
    const { time, date } = dosTime(new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
    local.writeUInt16LE(20, 4); // 解压所需版本
    local.writeUInt16LE(0x0800, 6); // 文件名使用 UTF-8
    local.writeUInt16LE(0, 8); // 压缩方式：0 = 不压缩
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    await write(local);
    await write(name);
    await write(data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); // 中央目录签名
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42); // 本地文件头的位置
    central.push(Buffer.concat([entry, name]));

    offset += local.length + name.length + data.length;
  }

  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 目录结束签名
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  await write(dir);
  await write(end);
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
