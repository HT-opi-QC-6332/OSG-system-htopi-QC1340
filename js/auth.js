/**
 * OSG - Authentication Module
 * Handles login, logout, session management, and password changes.
 */

const AUTH_KEY = 'OSG_AUTH_SESSION';

const Auth = {
    /**
     * Check if user is logged in
     * @returns {boolean}
     */
    isLoggedIn() {
        const session = this.getSession();
        if (!session) return false;

        // Check token expiration (optional: implementation depends on token structure or logic)
        // For this simple version, we just check existence and expiration date
        const now = new Date().getTime();
        if (now > session.expiresAt) {
            this.logout();
            return false;
        }
        return true;
    },

    /**
     * Get current session data
     * @returns {Object|null}
     */
    getSession() {
        const json = localStorage.getItem(AUTH_KEY);
        if (!json) return null;
        try {
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    },

    /**
     * Get current user info
     * @returns {Object|null}
     */
    getUser() {
        const session = this.getSession();
        return session ? session.user : null;
    },

    /**
     * Login function
     * @param {string} userId 
     * @param {string} password 
     */
    async login(userId, password) {
        try {
            const params = new URLSearchParams();
            params.append('action', 'login');
            params.append('userId', userId);
            params.append('password', password);

            const response = await fetch(CONFIG.GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const result = await response.json();

            if (result.success) {
                this.setSession(result.user, result.token);
                return { success: true };
            } else {
                return { success: false, message: result.message || 'ログイン失敗' };
            }
        } catch (error) {
            console.error('Login error:', error);
            if (error.message.includes('Unexpected token')) {
                return { success: false, message: 'サーバー応答エラー (GASコードを更新してください)' };
            }
            return { success: false, message: '通信エラーが発生しました' };
        }
    },

    /**
     * @param {Object} user 
     * @param {string} token 
     */
    /**
     * Change Password function
     */
    async changePassword(oldPassword, newPassword) {
        const user = this.getUser();
        if (!user) return { success: false, message: 'ログインしていません' };

        try {
            const params = new URLSearchParams();
            params.append('action', 'changePassword');
            params.append('userId', user.id);
            params.append('oldPassword', oldPassword);
            params.append('newPassword', newPassword);

            const response = await fetch(CONFIG.GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Change password error:', error);
            return { success: false, message: 'エラーが発生しました' };
        }
    },

    /**
     * Set session to localStorage
     * @param {Object} user 
     * @param {string} token 
     */
    setSession(user, token) {
        const expiresAt = new Date().getTime() + (7 * 24 * 60 * 60 * 1000); // 7 days
        const session = {
            user: user,
            token: token,
            expiresAt: expiresAt
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    },

    /**
     * Logout function
     */
    logout() {
        localStorage.removeItem(AUTH_KEY);
        window.location.href = 'login.html';
    },

    /**
     * Mock API for initial development (to be replaced with GAS call)
     */
    async mockLoginApi(userId, password) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Temporary simplified mock logic
                if (password === 'admin') {
                    resolve({
                        success: true,
                        token: 'mock_token_' + Date.now(),
                        user: {
                            id: userId,
                            name: '管理者 太郎',
                            role: '管理者', // 管理者, 製造課, 品管課, 閲覧者
                            workplaceCode: 'all' // P, A, C, all, or empty
                        }
                    });
                } else {
                    resolve({
                        success: false,
                        message: 'IDまたはパスワードが間違っています'
                    });
                }
            }, 800);
        });
    },

    /**
     * Require Login (Redirects if not logged in)
     * Place this at the start of osg-main.html
     */
    requireLogin() {
        if (!this.isLoggedIn()) {
            window.location.href = 'login.html';
        }
    },

    /**
     * Update local user session data
     * @param {Object} updates - Properties to update
     */
    updateUser(updates) {
        const session = this.getSession();
        if (session && session.user) {
            session.user = { ...session.user, ...updates };
            this.setSession(session.user, session.token);
            return session.user;
        }
        return null;
    }
};

// Auto-run for non-login pages
if (!window.location.pathname.includes('login.html')) {
    // Determine if we are on a page that needs auth
    // Simple check: if Auth object exists, we can run requireLogin
    // Auth.requireLogin(); // Call this in the specific page script instead for better control
}
