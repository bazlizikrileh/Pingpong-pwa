import { ogPage } from '../../server/og.js';
export const onRequestGet = ctx => ogPage(ctx, 't');
