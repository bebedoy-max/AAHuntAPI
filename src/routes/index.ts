import { Router, type IRouter } from "express";
import healthRouter from "./health";
import providersRouter from "./providers";
import researchRouter from "./research";
import apiKeysRouter from "./api-keys";
import codesRouter from "./codes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(providersRouter);
router.use(researchRouter);
router.use(apiKeysRouter);
router.use(codesRouter);

export default router;
