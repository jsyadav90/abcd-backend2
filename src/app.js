import express from "express"
import cookieParser from "cookie-parser";
import cors from 'cors'

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
}))

app.use(express.json({limit:"16kb"}))
app.use(express.urlencoded({extended:true, limit:"16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

app.get("/", (req, res) => {
    res.json({ message: "Backend is working!" });
});

//Routes import
// import authRoutes from "./routes/auth.routes.js";
// import branchRoutes from "./routers/branch.routes.js"
// import groupRouter from "./routes/group.routes.js"
import userRouter from "./routers/user.routes.js"


// Router declaration
// app.use("/api/v1/auth", authRoutes);
// app.use("/api/v1/branches", branchRoutes)
// app.use("/api/v1/group", groupRouter)
app.use("/api/v1/users", userRouter)


export {app}