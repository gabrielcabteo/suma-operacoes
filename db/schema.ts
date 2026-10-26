import {sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const operations=sqliteTable('operations',{id:text('id').primaryKey(),date:text('date').notNull(),created:text('created').notNull(),data:text('data').notNull()});
