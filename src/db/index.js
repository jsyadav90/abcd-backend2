import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { app } from "../app.js";

const connectDB = async () => {
  try {
    const connectionInstance =  await mongoose.connect(`${process.env.MONGO_DB_URI}/${DB_NAME}`)
    app.on("error", (error)=>{
      console.log(`err:`, error);
      throw error
    })
    console.log(`n MongoDB connected !! DB Host: ${connectionInstance.connection.host}`);
  } catch (error) {
    console.log("MongoDB Connection Failed (index (DB) file)", error);
    process.exit(1);
  }
};


export default connectDB;