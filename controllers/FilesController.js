import { ObjectId } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as mime from 'mime-types';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    const fileCollection = dbClient.client.db().collection('files');
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
    }
    const owner = new ObjectId(String(userId));
    const { body } = req;
    const {
      name, type, data, parentId, isPublic,
    } = body;
    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!data && (type !== 'folder')) {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    let parentIdObj;
    if (parentId) {
      parentIdObj = new ObjectId(String(parentId));
      const parentFolder = await fileCollection.findOne({ _id: parentIdObj });
      if (!parentFolder) {
        res.status(400).json({ error: 'Parent not found' });
        return;
      }
      if (parentFolder.type !== 'folder') {
        res.status(400).json({ error: 'Parent is not a folder' });
        return;
      }
    } else {
      parentIdObj = 0;
    }
    const fileObj = {
      name, type, data, userId: owner,
    };
    fileObj.isPublic = isPublic || false;
    fileObj.parentId = parentIdObj;
    if (type === 'folder') {
      const result = await fileCollection.insertOne(fileObj);
      res.status(201).json({
        id: result.insertedId, userId: owner, name, type, isPublic, parentId: fileObj.parentId,
      });
      return;
    }
    const path = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fs.promises.mkdir(path, { recursive: true });
    const localPath = `${path}/${uuidv4()}`;
    const fileBfuffer = Buffer.from(data, 'base64');
    fs.writeFileSync(localPath, fileBfuffer);
    fileObj.localPath = localPath;
    const resp = await fileCollection.insertOne(fileObj);
    res.status(201).json({
      id: resp.insertedId, userId: owner, name, type, isPublic, parentId: fileObj.parentId,
    });
    if (type === 'image') {
      await fileQueue.add({ userId: owner, fileId: resp.insertedId });
    }
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const owner = new ObjectId(String(userId));
    const { id } = req.params;
    const fileCollection = dbClient.client.db().collection('files');
    const file = await fileCollection.findOne({ _id: new ObjectId(String(id)), userId: owner });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const owner = new ObjectId(String(userId));
    const { parentId, page = 0 } = req.query;
    let query;
    if (parentId) {
      query = { parentId: new ObjectId(String(parentId)), userId: owner };
    } else {
      query = { userId: owner };
    }
    const fileCollection = dbClient.client.db().collection('files');
    const pageSize = 20;
    const pageNumber = parseInt(page, 10);
    const pipeline = [
      { $match: query },
      { $skip: pageNumber * pageSize },
      { $limit: pageSize },
      {
        $project: {
          _id: 1,
          userId: 1,
          name: 1,
          type: 1,
          isPublic: 1,
          parentId: 1,
        },
      },
    ];
    const files = await fileCollection.aggregate(pipeline).toArray();
    const newArr = files.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
    res.status(200).json(newArr);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const owner = new ObjectId(String(userId));
    const { id } = req.params;
    const fileId = new ObjectId(String(id));
    const fileCollection = dbClient.client.db().collection('files');
    const file = await fileCollection.findOne({ _id: fileId, userId: owner });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
    } else {
      await fileCollection.updateOne({ _id: fileId }, { $set: { isPublic: true } });
      file.isPublic = true;
      res.status(200).json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: true,
        parentId: file.parentId,
      });
    }
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const owner = new ObjectId(String(userId));
    const { id } = req.params;
    const fileId = new ObjectId(String(id));
    const fileCollection = dbClient.client.db().collection('files');
    const file = await fileCollection.findOne({ _id: fileId, userId: owner });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
    } else {
      await fileCollection.updateOne({ _id: fileId }, { $set: { isPublic: false } });
      file.isPublic = false;
      res.status(200).json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: false,
        parentId: file.parentId,
      });
    }
  }

  static async getFile(req, res) {
    const token = req.headers['x-token'];
    let owner;
    if (token) {
      const userId = await redisClient.get(`auth_${token}`);
      if (userId) {
        owner = new ObjectId(String(userId));
      }
    }
    const fileCollection = dbClient.client.db().collection('files');
    const { id } = req.params;
    let { size } = req.query;
    const file = await fileCollection.findOne({ _id: new ObjectId(String(id)) });
    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (file.isPublic === false) {
      if (!owner || (file.userId.toString() !== owner.toString())) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }
    if (file.type === 'folder') {
      res.status(400).json({ error: "A folder doesn't have content" });
      return;
    }
    let filePath;
    if ((file.type === 'image') && size) {
      size = size.toString();
      filePath = `${file.localPath}_${size}`;
    } else {
      filePath = file.localPath;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const mimeType = mime.lookup(file.name);
    res.setHeader('Content-Type', mimeType);
    const fileData = (await fs.promises.readFile(filePath));
    res.status(200).send(fileData);
  }
}

module.exports = FilesController;
