// Language detection and switching functionality
(function() {
    'use strict';

    // Get current language from URL or localStorage
    function getCurrentLanguage() {
        const path = window.location.pathname;
        if (path.startsWith('/ko/') || path.startsWith('/ko')) {
            return 'ko';
        } else if (path.startsWith('/en/') || path.startsWith('/en')) {
            return 'en';
        }
        
        // Check localStorage for saved preference
        const savedLang = localStorage.getItem('preferred-language');
        if (savedLang) {
            return savedLang;
        }
        
        // Detect browser language
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang.startsWith('ko')) {
            return 'ko';
        }
        
        return 'en'; // Default to English
    }

    // Detect browser language and redirect if needed
    function detectAndRedirect() {
        const path = window.location.pathname;
        
        // If we're on the root path, redirect based on saved preference or detected language
        if (path === '/' || path === '') {
            // Check localStorage first
            const savedLang = localStorage.getItem('preferred-language');
            let targetLang = 'en';
            
            if (savedLang) {
                targetLang = savedLang;
            } else {
                // Detect browser language only if no saved preference
                const browserLang = navigator.language || navigator.userLanguage;
                if (browserLang.startsWith('ko')) {
                    targetLang = 'ko';
                }
                // Save the detected preference
                localStorage.setItem('preferred-language', targetLang);
            }
            
            // Redirect to language-specific path
            window.location.href = '/' + targetLang + path;
        }
    }

    // Switch language
    function switchLanguage(lang) {
        const currentPath = window.location.pathname;
        let newPath;
        
        // Check if we're on a project detail page
        const projectMatch = currentPath.match(/\/(ko|en)\/works\/(.+)/);
        if (projectMatch) {
            // We're on a project detail page, keep the same project
            const projectName = projectMatch[2];
            newPath = '/' + lang + '/works/' + projectName;
        } else if (currentPath.includes('/blog/')) {
            // We're on a blog page, check if it's a specific post or blog list
            const blogPostMatch = currentPath.match(/\/(ko|en)\/blog\/(.+)/);
            if (blogPostMatch) {
                // We're on a specific blog post, switch to the same post in different language
                const postName = blogPostMatch[2];
                newPath = '/' + lang + '/blog/' + postName;
            } else {
                // We're on the blog list page, switch to blog list in different language
                newPath = '/' + lang + '/blog/';
            }

        } else if (currentPath.includes('/categories/')) {
            // We're on a category page, switch to the same category in different language
            const categoryMatch = currentPath.match(/\/(ko|en)\/categories\/(.+)/);
            if (categoryMatch) {
                let category = categoryMatch[2];
                
                // Remove trailing slash if present
                category = category.replace(/\/$/, '');
                
                // Decode URL-encoded category name
                category = decodeURIComponent(category);
                
                // Map categories between languages
                const categoryMap = {
                    '개발': 'development',
                    '개념': 'concept',
                    '에러': 'error',
                    '자유': 'free',
                    'development': '개발',
                    'concept': '개념',
                    'error': '에러',
                    'free': '자유'
                };
                const newCategory = categoryMap[category] || category;
                newPath = '/' + lang + '/categories/' + newCategory + '/';
            } else {
                newPath = '/' + lang + '/blog/';
            }
        } else if (currentPath.includes('/2024/') || currentPath.includes('/2020/') || currentPath.includes('/2016/')) {
            // We're on a blog post page, switch to the same post in different language
            const postMatch = currentPath.match(/\/(ko|en)\/(.+)\/(\d{4})\/(\d{2})\/(\d{2})\/(.+)/);
            if (postMatch) {
                const category = postMatch[2];
                const year = postMatch[3];
                const month = postMatch[4];
                const day = postMatch[5];
                const postName = postMatch[6];
                
                // Map categories between languages
                const categoryMap = {
                    '개발': 'development',
                    '개념': 'concept',
                    '에러': 'error',
                    '자유': 'free',
                    'development': '개발',
                    'concept': '개념',
                    'error': '에러',
                    'free': '자유'
                };
                const newCategory = categoryMap[category] || category;
                newPath = '/' + lang + '/' + newCategory + '/' + year + '/' + month + '/' + day + '/' + postName;
            } else {
                newPath = '/' + lang + '/blog/';
            }
        } else {
            // Regular page, just change language prefix
            const pathWithoutLang = currentPath.replace(/^\/(ko|en)/, '');
            newPath = '/' + lang + pathWithoutLang;
        }
        
        // Save preference
        localStorage.setItem('preferred-language', lang);
        
        // Redirect
        window.location.href = newPath;
    }

    // 프로젝트 상세 페이지 언어 전환 함수
    function switchProjectLanguage(lang) {
        const currentPath = window.location.pathname;
        
        // 현재 경로에서 프로젝트명 추출
        const projectMatch = currentPath.match(/\/(ko|en)\/works\/(.+)/);
        if (projectMatch) {
            const projectName = projectMatch[2];
            const newPath = '/' + lang + '/works/' + projectName;
            window.location.href = newPath;
        }
    }

    // Handle navigation links
    function fixNavigationLinks() {
        // Handle anchor links for smooth scrolling
        const anchorLinks = document.querySelectorAll('a[href^="#"]');
        anchorLinks.forEach(link => {
            // Remove any existing click handlers to avoid duplicates
            link.removeEventListener('click', handleAnchorClick);
            // Add click handler for smooth scrolling to anchors
            link.addEventListener('click', handleAnchorClick);
        });
        
        // Handle navigation links that should go to home page with anchors
        const navLinks = document.querySelectorAll('a[href*="#"]');
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes('#') && !href.startsWith('#')) {
                // This is a link like "/ko/#section" or "/en/#section"
                link.removeEventListener('click', handleNavAnchorClick);
                link.addEventListener('click', handleNavAnchorClick);
            }
        });
    }
    
    // Handle anchor link clicks
    function handleAnchorClick(e) {
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
            e.preventDefault();
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }
    
    function handleNavAnchorClick(e) {
        e.preventDefault();
        const href = this.getAttribute('href');
        
        // Check if we're already on the home page
        const currentPath = window.location.pathname;
        const isHomePage = currentPath === '/ko/' || currentPath === '/en/' || currentPath === '/';
        
        if (isHomePage) {
            // We're on home page, just scroll to the section
            const anchor = href.split('#')[1];
            const targetElement = document.getElementById(anchor);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        } else {
            // We're not on home page, navigate to home page with anchor
            window.location.href = href;
        }
    }

    // Initialize language switcher
    function initLanguageSwitcher() {
        // Add click handlers to language switcher links
        document.addEventListener('DOMContentLoaded', function() {
            const koLink = document.querySelector('a[data-lang="ko"]');
            const enLink = document.querySelector('a[data-lang="en"]');
            
            if (koLink) {
                koLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    switchLanguage('ko');
                });
            }
            
            if (enLink) {
                enLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    switchLanguage('en');
                });
            }
            
            // Update language switcher visual state
            updateLanguageSwitcherState();
            
            // Fix navigation links
            fixNavigationLinks();
        });
    }

    // Update language switcher visual state
    function updateLanguageSwitcherState() {
        const currentLang = getCurrentLanguage();
        const koLink = document.querySelector('a[data-lang="ko"]');
        const enLink = document.querySelector('a[data-lang="en"]');
        
        if (koLink) {
            if (currentLang === 'ko') {
                koLink.classList.add('active');
            } else {
                koLink.classList.remove('active');
            }
        }
        
        if (enLink) {
            if (currentLang === 'en') {
                enLink.classList.add('active');
            } else {
                enLink.classList.remove('active');
            }
        }
    }

    // Load language-specific content
    function loadLanguageContent(lang) {
        // This function will be called by the template to load content
        window.currentLanguage = lang;
        
        // Update page language attribute
        document.documentElement.lang = lang;
        
        // Add language class to body
        document.body.classList.add('lang-' + lang);
    }

    // Expose functions globally
    window.LanguageSwitcher = {
        getCurrentLanguage: getCurrentLanguage,
        switchLanguage: switchLanguage,
        switchProjectLanguage: switchProjectLanguage,
        loadLanguageContent: loadLanguageContent,
        detectAndRedirect: detectAndRedirect,
        fixNavigationLinks: fixNavigationLinks,
        updateLanguageSwitcherState: updateLanguageSwitcherState
    };

    // Initialize on page load
    initLanguageSwitcher();
    
    // Auto-detect and redirect if on root
    if (window.location.pathname === '/' || window.location.pathname === '') {
        detectAndRedirect();
    }

    // Expose switchProjectLanguage globally for inline onclick
    window.switchProjectLanguage = switchProjectLanguage;

})(); 