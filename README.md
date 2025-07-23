# Job Application Tracker

A modern web application for tracking job applications with real-time analytics to Borderless Comunity.

## ✨ Features

- 📊 **Analytics Dashboard** - Real-time insights with interactive charts
- 📝 **Application Management** - Track applications through customizable stages  
- 🏢 **Platform Tracking** - Organize by job boards (LinkedIn, Indeed, etc.)
- 🎯 **Progress Timeline** - Visual application progress tracking

## 🚀 Quick Start

### Using Docker (Recommended)

Run with persistent data:
```bash
docker run -d -p 8088:8088 -v $(pwd)/data:/app/data brunnox/job-tracker
```

Access the application at `http://localhost:8088`

### Local Development

1. **Clone and setup**
   ```bash
   git clone https://github.com/ProgramadoresSemPatria/application_panel.git
   cd application_panel
   pip install flask
   ```

2. **Run application**
   ```bash
   python app.py
   ```

3. **Open browser**
   Navigate to `http://localhost:8088`

## 📖 How to Use

1. **Add Platforms** - Set up your job boards (LinkedIn, Indeed, etc.)
2. **Create Applications** - Add job applications with company and role details
3. **Track Progress** - Update application status as you progress through interviews
4. **Monitor Analytics** - View success rates and performance insights on the dashboard
5. **Manage Settings** - Customize application steps and feedback types

## 🛠 Tech Stack

- **Backend**: Python, Flask, SQLite
- **Frontend**: HTML5, CSS3, JavaScript, Chart.js
- **Design**: Glassmorphism
- **Icons**: FontAwesome

## 📁 Project Structure

```
├── app.py                 # Flask application
├── database.db            # SQLite database
├── static/
│   ├── css/style.css      # Glassmorphism styling
│   └── images/            # Assets
└── templates/             # HTML templates
    ├── base.html          # Base layout
    ├── home.html          # Analytics dashboard
    ├── applications.html  # Application management
    ├── platforms.html     # Platform management
    └── settings.html      # Configuration
```

## 🎯 Key Features

### Dashboard Analytics
- Application success rates and conversion funnel
- Platform performance comparison  
- Time-based metrics and trends
- Visual charts with Chart.js

### Application Management
- Full CRUD operations for job applications
- Step-by-step progress tracking with timeline
- Search and filter across all fields
- Modal-based interfaces for easy editing

### Customization
- Define custom application steps
- Color-coded progress indicators
- Feedback types and categories
- Protected system steps (Applied, Offer, Denied)

## 🔧 Configuration

### Docker Volumes
- `/app/data` - Persistent database storage
- Mount local directory to preserve data between container restarts


## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/new-feature`)
3. Commit changes (`git commit -m 'Add new feature'`)
4. Push to branch (`git push origin feature/new-feature`)
5. Open Pull Request


## 🙏 Credits

Built with ☕ by [@brxnnox](https://github.com/brxnnox)

---

**Ready to organize your job search? Get started with Docker in one command! 🚀**
