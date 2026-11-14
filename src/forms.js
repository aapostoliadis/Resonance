import {buildDetailedForms,resizeArt} from './reference-art.js';
export function buildReferenceForms(owner){buildDetailedForms(owner);}
export function resizeReferenceForms(owner,level){for(const form of owner.referenceForms)if(form.name===owner.current?.mode)resizeArt(form,level,owner);}
