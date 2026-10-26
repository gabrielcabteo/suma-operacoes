import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'pages',base:'/suma-operacoes/',plugins:[react()],publicDir:'../public',build:{outDir:'../dist-pages',emptyOutDir:true},css:{postcss:{plugins:[]}}});
