import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/main.css';
import 'katex/dist/katex.min.css';
import { router } from './app/router';

createApp(App).use(createPinia()).use(router).mount('#app');
