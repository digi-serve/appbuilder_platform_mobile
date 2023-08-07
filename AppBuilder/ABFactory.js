import { cloneDeep } from "lodash";
import ABFactoryCore from "./core/ABFactoryCore";
export default class ABFactory extends ABFactoryCore {
   cloneDeep(...args) {
      return cloneDeep(...args);
   }

   notify(...args) {
      console.warn("TODO: AB.notify");
      console.log(...args);
   }
}
