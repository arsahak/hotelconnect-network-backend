import type { ISupplier } from "../models/supplier.model";
import type { IUser } from "../models/user.model";

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      /** Set by `supplierOnly`: the active supplier of the signed-in account. */
      supplier?: ISupplier;
    }
  }
}

export {};
