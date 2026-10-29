export const truckTypes=['Open body','Container','Trailer','Tipper','Tanker','Refrigerated','LCV'] as const;
export type SupplierProfile={name:string;kind:string;city:string;contact:string;phone:string;email:string;about:string};
export type SupplierTruck={id:string;registration:string;type:string;capacity:number;relationship:string;status:string;city:string;availableUntil:string};
export type SupplierLane={id:string;origin:string;destination:string;type:string;returnRoute:boolean};
export type SupplierDraft={profile:SupplierProfile;trucks:SupplierTruck[];routes:SupplierLane[]};
