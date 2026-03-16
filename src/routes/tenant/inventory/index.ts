import { Hono } from "hono";
import type { Env } from "../../../types";

import stock from "./stock";
import vendors from "./vendors";
import stores from "./stores";
import items from "./items";
import settings from "./settings";
import po from "./po";
import gr from "./gr";
import req from "./req";
import dispatch from "./dispatch";
import writeoff from "./writeoff";
import ret from "./return";
import rfq from "./rfq";

const inventory = new Hono<{ Bindings: Env; Variables: { tenantId?: string; userId?: string; role?: string } }>();

// Auth is already applied by parent chain in src/index.ts

inventory.route("/stock", stock);
inventory.route("/vendors", vendors);
inventory.route("/stores", stores);
inventory.route("/items", items);
inventory.route("/po", po);
inventory.route("/purchase-orders", po);
inventory.route("/gr", gr);
inventory.route("/goods-receipts", gr);
inventory.route("/req", req);
inventory.route("/requisitions", req);
inventory.route("/dispatch", dispatch);
inventory.route("/dispatches", dispatch);
inventory.route("/writeoff", writeoff);
inventory.route("/return", ret);
inventory.route("/rfq", rfq);

// Mapped to root of /inventory (e.g. /inventory/categories)
inventory.route("/", settings);

export default inventory;
