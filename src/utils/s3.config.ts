import {
    DeleteObjectCommand,
    PutObjectCommand,
    S3Client,
  } from "@aws-sdk/client-s3";
  import {
    AWS_ACCESS_KEY,
    AWS_REGION,
    AWS_SECRET_KEY,
  } from "./envConfig.js";
  import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
  
  interface S3ClientConfig {
    region: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  }
  
  const s3ClientConfig: S3ClientConfig = {
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY,
      secretAccessKey: AWS_SECRET_KEY,
    },
  };
  
  const s3Client = new S3Client(s3ClientConfig);
  
  const deleteFiles3 = async (bucket: string, key: string) => {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  };
  
  const uploadToS3 = async (
    bucket: string,
    key: string,
    data: Buffer,
    ContentType: string
  ) => {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: ContentType,
      })
    );
  };
  
  async function generatePresignedUrl(
    bucketName: string,
    key: string,
    contentType: string
  ) {
    const params = {
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    };
  
    // Create the PutObjectCommand
    const command = new PutObjectCommand(params);
  
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  
    return signedUrl;
  }
  
  export { s3Client, deleteFiles3, uploadToS3, generatePresignedUrl };