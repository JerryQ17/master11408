import { createRouter, createWebHistory } from 'vue-router';
import { useSession } from './session';
import LoginPage from '../pages/LoginPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import StudyPage from '../pages/StudyPage.vue';
import PracticeSessionPage from '../pages/PracticeSessionPage.vue';
import WrongBookPage from '../pages/WrongBookPage.vue';
import StatisticsPage from '../pages/StatisticsPage.vue';
import NotePage from '../pages/NotePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginPage, meta: { public: true } },
    { path: '/enroll', component: LoginPage, meta: { public: true } },
    { path: '/settings', component: SettingsPage },
    { path: '/wrong-book', component: WrongBookPage },
    { path: '/statistics', component: StatisticsPage },
    { path: '/notes/:noteId', component: NotePage },
    { path: '/graph/:subjectId', component: () => import('../pages/GraphPage.vue') },
    { path: '/practice/:sessionId/:ordinal', component: PracticeSessionPage },
    { path: '/study/:topicId', component: StudyPage },
    { path: '/', redirect: '/study/math1.double-integral.definition' },
  ],
});

router.beforeEach(async (to) => {
  const session = useSession();
  if (!session.initialized) await session.load();
  if (!to.meta.public && !session.user) return { path: '/login', query: { redirect: to.fullPath } };
});
