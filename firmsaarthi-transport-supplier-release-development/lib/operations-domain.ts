export const stages=['initiated','in_progress','complete'] as const;
export const stageLabels:Record<string,string>={initiated:'Initiated',in_progress:'In progress',complete:'Complete'};
export const fileCategories=['driver','truck','truck_owner','consignment_copy','pod','other'] as const;
