import React,{createContext,useContext} from 'react';import {staticFile} from 'remotion';
export const AssetUrls=createContext<Record<string,string>>({});
export function useAssetUrl(){const urls=useContext(AssetUrls);return (path:string)=>urls[path]||staticFile(path);}
