from flask import Flask, request, render_template, redirect, url_for, flash, session, abort
import sqlite3
import os
import shutil

# Initialize Flask application
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', os.urandom(24).hex())

DATABASE_PATH = 'database.db'

def get_database_connection():
    """
    Establishes a connection to the SQLite database.
    
    Returns:
        sqlite3.Connection: Database connection with foreign keys enabled
        and row factory set to sqlite3.Row for dict-like access
    """
    con = sqlite3.connect(DATABASE_PATH)
    con.execute("PRAGMA foreign_keys = ON")  # Enable foreign key constraints
    con.row_factory = sqlite3.Row  # Enable dict-like access to rows
    return con


@app.route('/')
@app.route('/home')
def home():
    """
    Home dashboard with application analytics and metrics.
    
    Displays:
    - Total applications count
    - Applications per step with conversion rates
    - Applications by platform
    - Applications by mode (remote/hybrid/onsite)
    - Monthly application trends
    - Success metrics and average days per step
    
    Returns:
        str: Rendered home.html template with analytics data
    """
    con = get_database_connection()
    cur = con.cursor()
    
    # Get total applications count
    cur.execute("SELECT COUNT(DISTINCT application_id) as total FROM steps")
    total_applications = cur.fetchone()['total']

    # Get applications count per step - this shows how many unique applications
    # have actually passed through each step (based on the steps history table)
    cur.execute("""
        SELECT 
            sd.id as step_id,
            sd.name as step_name,
            sd.color as step_color,
            COUNT(DISTINCT s.application_id) as applications_count
        FROM steps_definition sd
        LEFT JOIN steps s ON s.step_id = sd.id
        GROUP BY sd.id, sd.name, sd.color
        ORDER BY sd.id
    """)
    applications_per_step = cur.fetchall()

    # Calculate conversion rates for each step
    conversion_data = []
    for step in applications_per_step:
        # Conversion rate = (applications that reached this step / total applications) * 100
        conversion_rate = (
            round((step['applications_count'] / total_applications * 100), 1) 
            if total_applications > 0 else 0
        )
        conversion_data.append({
            'step_id': step['step_id'],
            'step_name': step['step_name'],
            'step_color': step['step_color'],
            'applications_count': step['applications_count'],  # Applications that actually went through this step
            'conversion_rate': conversion_rate
        })
    
    # Get applications grouped by platform (only platforms with applications)
    cur.execute("""
        SELECT p.name as platform_name, COUNT(a.id) as count
        FROM platforms p
        LEFT JOIN applications a ON a.platform_id = p.id
        GROUP BY p.name
        HAVING COUNT(a.id) > 0
        ORDER BY count DESC
    """)
    applications_by_platform = cur.fetchall()
    
    # Get applications grouped by work mode (remote, hybrid, onsite)
    cur.execute("""
        SELECT mode, COUNT(*) as count
        FROM applications
        GROUP BY mode
    """)
    applications_by_mode = cur.fetchall()
    
    # Get daily applications for the last month
    cur.execute("""
        SELECT 
            application_date,
            COUNT(*) as count
        FROM applications
        WHERE application_date >= date('now', '-1 months')
        GROUP BY application_date
        ORDER BY application_date
    """)
    monthly_applications = cur.fetchall()
    
    # Get success metrics
    # Assuming step 6 is "Offer" and step 7 is "Denied"
    cur.execute("SELECT COUNT(*) as offers FROM applications WHERE last_step = 6")
    total_offers = cur.fetchone()['offers']
    
    cur.execute("SELECT COUNT(*) as denials FROM applications WHERE last_step = 7")
    total_denials = cur.fetchone()['denials']
    
    # Calculate success rate as percentage of offers vs total applications
    success_rate = (
        round((total_offers / total_applications * 100), 1) 
        if total_applications > 0 else 0
    )

    # Calculate average days from application to each step
    cur.execute("""
        SELECT 
            sd.name as step_name,
            sd.color as step_color,
            COALESCE(savg.avg_days, 0) as avg_days
        FROM steps_definition sd 
        LEFT JOIN (
            SELECT 
                s.step_id, 
                AVG(CAST((julianday(s.step_date) - julianday(a.application_date)) AS INTEGER)) as avg_days
            FROM steps s
            LEFT JOIN applications a ON a.id = s.application_id
            WHERE s.step_id != 1  -- Exclude initial application step
            GROUP BY s.step_id
        ) as savg ON sd.id = savg.step_id
        ORDER BY sd.id
    """)
    average_days_per_step = cur.fetchall()
    
    con.close()
    
    # Render template with all analytics data
    return render_template(
        'home.html',
        total_applications=total_applications,
        conversion_data=conversion_data,
        applications_by_platform=applications_by_platform,
        applications_by_mode=applications_by_mode,
        monthly_applications=monthly_applications,
        average_days_per_step=average_days_per_step,
        total_offers=total_offers,
        total_denials=total_denials,
        success_rate=success_rate
    )


@app.route('/applications', methods=['GET', 'POST'])
def applications():
    """
    Handle job applications listing and creation.
    
    GET: Display all applications with their steps and related data
    POST: Create a new job application with initial step
    
    Returns:
        str: Rendered applications.html template or redirect to applications page
    """
    if request.method == "GET":
        con = get_database_connection()
        cur = con.cursor()

        # Get all applications with joined platform, step, and feedback information
        cur.execute("""
            SELECT 
                applications.*, 
                platforms.name as platform_name, 
                steps_definition.name as step_name, 
                steps_definition.color as step_color, 
                feedbacks_definition.name as feedback_name, 
                feedbacks_definition.color as feedback_color 
            FROM applications 
            LEFT JOIN platforms ON applications.platform_id = platforms.id 
            LEFT JOIN steps_definition ON applications.last_step = steps_definition.id 
            LEFT JOIN feedbacks_definition ON applications.feedback_id = feedbacks_definition.id 
            ORDER BY applications.application_date DESC
        """)
        applications = cur.fetchall()

        # Get reference data for form dropdowns
        cur.execute("SELECT * FROM platforms")
        platforms = cur.fetchall()

        cur.execute("SELECT * FROM steps_definition")
        steps_definition = cur.fetchall()

        cur.execute("SELECT * FROM feedbacks_definition")
        feedbacks_definition = cur.fetchall()

        # Enhance applications with their complete step history
        applications_with_steps = []
        for app in applications:
            # Get all steps for this application with step details
            cur.execute("""
                SELECT 
                    s.*, 
                    sd.name as step_name, 
                    sd.description as step_description, 
                    sd.color as step_color
                FROM steps s
                JOIN steps_definition sd ON s.step_id = sd.id
                WHERE s.application_id = ?
                ORDER BY s.step_date ASC
            """, (app['id'],))
            
            steps = cur.fetchall()

            # Convert Row object to dict and add steps
            app_dict = dict(app)
            app_dict['steps'] = steps
            applications_with_steps.append(app_dict)

        con.close()
        
        return render_template(
            'applications.html', 
            applications=applications_with_steps, 
            platforms=platforms, 
            steps_definition=steps_definition, 
            feedbacks_definition=feedbacks_definition
        )
    
    if request.method == "POST":
        # Extract form data for new application
        company = request.form.get('company')
        role = request.form.get('role')
        application_date = request.form.get('application_date')
        platform_id = request.form.get('platform_id')
        expected_salary = request.form.get('expected_salary')
        mode = request.form.get('mode')
        salary_range_min = request.form.get('salary_range_min')
        salary_range_max = request.form.get('salary_range_max')
        observation = request.form.get('observation')

        con = get_database_connection()
        cur = con.cursor()

        # Insert new application with initial step (step 1) and default feedback
        cur.execute("""
            INSERT INTO applications 
            (company, role, application_date, platform_id, expected_salary, mode, 
             salary_range_min, salary_range_max, observation, last_step, 
             last_step_date, feedback_id, feedback_date) 
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            company, role, application_date, platform_id, expected_salary, mode,
            salary_range_min, salary_range_max, observation, 1, application_date, 
            1, application_date
        ))
        
        # Get the ID of the newly created application
        application_id = cur.lastrowid
        
        # Create the initial step record
        cur.execute("""
            INSERT INTO steps (application_id, step_id, step_date) 
            VALUES(?, ?, ?)
        """, (application_id, 1, application_date))
        
        con.commit()
        con.close()
        
        return redirect(url_for('applications'))


@app.route('/applications/<int:application_id>/delete', methods=['POST'])
def delete_application(application_id):
    """
    Delete a specific job application.
    
    Args:
        application_id (int): ID of the application to delete
        
    Returns:
        Response: Redirect to applications page
    """
    con = get_database_connection()
    cur = con.cursor()

    # Delete application (related steps will be deleted via foreign key constraints)
    cur.execute("DELETE FROM applications WHERE id = ?", [application_id])
    
    con.commit()
    con.close()
    
    return redirect(url_for('applications'))


@app.route('/applications/<int:application_id>/update', methods=['POST'])
def update_application(application_id):
    """
    Update an existing job application's basic information.
    
    Args:
        application_id (int): ID of the application to update
        
    Returns:
        Response: Redirect to applications page
    """
    # Extract updated form data
    application_date = request.form.get('application_date')
    company = request.form.get('company')
    role = request.form.get('role')
    platform_id = request.form.get('platform_id')
    salary_range_min = request.form.get('salary_range_min')
    salary_range_max = request.form.get('salary_range_max')
    expected_salary = request.form.get('expected_salary')
    mode = request.form.get('mode')
    observation = request.form.get('observation')

    con = get_database_connection()
    cur = con.cursor()

    # Update application with new data
    cur.execute("""
        UPDATE applications 
        SET application_date = ?, company = ?, role = ?, platform_id = ?, 
            salary_range_min = ?, salary_range_max = ?, expected_salary = ?, 
            mode = ?, observation = ? 
        WHERE id = ?
    """, (
        application_date, company, role, platform_id, salary_range_min, 
        salary_range_max, expected_salary, mode, observation, application_id
    ))
    
    con.commit()
    con.close()
    
    return redirect(url_for('applications'))


@app.route('/applications/<int:application_id>/add-step', methods=['POST'])
def add_step_application(application_id):
    """
    Add a new step to an existing job application.
    
    Args:
        application_id (int): ID of the application to add step to
        
    Returns:
        Response: Redirect to applications page with success message
    """
    step_id = request.form.get('step_id')
    step_date = request.form.get('step_date')
    observation = request.form.get('observation')
    
    con = get_database_connection()
    cur = con.cursor()

    # Insert new step record
    cur.execute("""
        INSERT INTO steps (application_id, step_id, observation, step_date) 
        VALUES (?, ?, ?, ?)
    """, (application_id, step_id, observation, step_date))
    
    # Update application's last step information
    cur.execute("""
        UPDATE applications 
        SET last_step = ?, last_step_date = ? 
        WHERE id = ?
    """, (step_id, step_date, application_id))
    
    con.commit()
    con.close()
    
    flash("Step added successfully!")
    return redirect(url_for('applications'))


@app.route('/applications/<int:application_id>/finalize', methods=['POST'])
def finalize_application(application_id):
    """
    Finalize a job application with final outcome (offer/rejection).
    
    Args:
        application_id (int): ID of the application to finalize
        
    Returns:
        Response: Redirect to applications page with success message
    """
    final_step = request.form.get('final_step')
    feedback_id = request.form.get('feedback_id')
    finalize_date = request.form.get('finalize_date')
    salary_offer = request.form.get('salary_offer')
    final_observation = request.form.get('final_observation')
    
    con = get_database_connection()
    cur = con.cursor()

    # Insert final step record
    cur.execute("""
        INSERT INTO steps (application_id, step_id, observation, step_date) 
        VALUES (?, ?, ?, ?)
    """, (application_id, final_step, final_observation, finalize_date))
    
    # Build dynamic update query for application
    update_query = """
        UPDATE applications 
        SET last_step = ?, last_step_date = ?, feedback_id = ?, feedback_date = ?
    """
    params = [final_step, finalize_date, feedback_id, finalize_date]
    
    # Add salary offer if provided
    if salary_offer:
        update_query += ", salary_offer = ?"
        params.append(salary_offer)
    
    update_query += " WHERE id = ?"
    params.append(application_id)
    
    cur.execute(update_query, params)
    
    con.commit()
    con.close()
    
    flash("Application finalized successfully!")
    return redirect(url_for('applications'))


@app.route('/applications/<int:application_id>/steps/<int:step_id>/delete', methods=['POST'])
def delete_step_application(application_id, step_id):
    """
    Delete a specific step from a job application.
    
    Args:
        application_id (int): ID of the application
        step_id (int): ID of the step record to delete
        
    Returns:
        Response: Redirect to applications page
    """
    con = get_database_connection()
    cur = con.cursor()

    # Delete the specific step record
    cur.execute("""
        DELETE FROM steps 
        WHERE application_id = ? AND id = ?
    """, (application_id, step_id))
    
    con.commit()
    con.close()
    
    return redirect(url_for('applications'))


@app.route('/applications/<int:application_id>/steps/<int:step_id>/update', methods=['POST'])
def update_step_application(application_id, step_id):
    """
    Update a specific step in a job application.
    
    Args:
        application_id (int): ID of the application
        step_id (int): ID of the step record to update
        
    Returns:
        Response: Redirect to applications page
    """
    steps_id = request.form.get('step_id')
    step_date = request.form.get('step_date')
    observation = request.form.get('observation')

    con = get_database_connection()
    cur = con.cursor()

    # Update the step record
    cur.execute("""
        UPDATE steps 
        SET step_id = ?, step_date = ?, observation = ? 
        WHERE application_id = ? AND id = ?
    """, (steps_id, step_date, observation, application_id, step_id))
    
    con.commit()
    con.close()
    
    return redirect(url_for('applications'))


@app.route('/platforms', methods=['GET', 'POST'])
def platforms():
    """
    Handle job platforms (LinkedIn, Indeed, etc.) listing and creation.
    
    GET: Display all platforms
    POST: Create a new platform
    
    Returns:
        str: Rendered platforms.html template or redirect to platforms page
    """
    if request.method == "GET":
        con = get_database_connection()
        cur = con.cursor()

        # Get all platforms
        cur.execute("SELECT * FROM platforms")
        platforms = cur.fetchall()
        
        con.close()
        
        return render_template('platforms.html', platforms=platforms)
    
    if request.method == "POST":
        # Extract form data for new platform
        name = request.form.get('platform_name')
        url = request.form.get('platform_url')

        con = get_database_connection()
        cur = con.cursor()

        # Insert new platform
        cur.execute("INSERT INTO platforms (name, url) VALUES(?, ?)", (name, url))
        
        con.commit()
        con.close()
        
        return redirect(url_for('platforms'))


@app.route('/platforms/<int:platform_id>/check_applications', methods=['GET'])
def check_platform_applications(platform_id):
    """
    Check how many applications are associated with a platform.
    
    Args:
        platform_id (int): ID of the platform to check
        
    Returns:
        dict: JSON response with application count
    """
    con = get_database_connection()
    cur = con.cursor()
    
    # Count applications using this platform
    cur.execute("SELECT COUNT(*) FROM applications WHERE platform_id = ?", [platform_id])
    count = cur.fetchone()[0]
    
    con.close()
    
    return {'count': count}


@app.route('/platforms/<int:platform_id>/update', methods=['POST'])
def update_platform(platform_id):
    """
    Update an existing platform's information.
    
    Args:
        platform_id (int): ID of the platform to update
        
    Returns:
        Response: Redirect to platforms page
    """
    name = request.form.get('platform_name')
    url = request.form.get('platform_url')

    con = get_database_connection()
    cur = con.cursor()

    # Update platform information
    cur.execute("""
        UPDATE platforms 
        SET name = ?, url = ? 
        WHERE id = ?
    """, (name, url, platform_id))
    
    con.commit()
    con.close()
    
    return redirect(url_for('platforms'))


@app.route('/platforms/<int:platform_id>/delete', methods=['POST'])
def delete_platform(platform_id):
    """
    Delete a platform and all associated applications.
    
    Args:
        platform_id (int): ID of the platform to delete
        
    Returns:
        Response: Redirect to platforms page
    """
    con = get_database_connection()
    cur = con.cursor()

    # Delete all applications using this platform first
    cur.execute("DELETE FROM applications WHERE platform_id = ?", [platform_id])
    
    # Then delete the platform itself
    cur.execute("DELETE FROM platforms WHERE id = ?", [platform_id])
    
    con.commit()
    con.close()
    
    return redirect(url_for('platforms'))


@app.route('/settings', methods=['GET', 'POST'])
def settings():
    """
    Handle application settings for steps and feedback definitions.
    
    GET: Display settings page with current definitions
    POST: Create new step or feedback definitions
    
    Returns:
        str: Rendered settings.html template or redirect to settings page
    """
    if request.method == "GET":
        con = get_database_connection()
        cur = con.cursor()

        # Get all feedback definitions
        cur.execute("SELECT * FROM feedbacks_definition")
        feedbacks = cur.fetchall()

        # Get all step definitions
        cur.execute("SELECT * FROM steps_definition")
        steps = cur.fetchall()

        con.close()
        
        return render_template('settings.html', feedbacks=feedbacks, steps=steps)
    
    if request.method == "POST":
        form_type = request.form.get('form_type')
        
        if form_type == 'create_step_defition':
            # Create new step definition
            name = request.form.get('step_name')
            description = request.form.get('step_description')
            color = request.form.get('step_color')

            con = get_database_connection()
            cur = con.cursor()

            cur.execute("""
                INSERT INTO steps_definition (name, description, color) 
                VALUES(?, ?, ?)
            """, (name, description, color))
            
            con.commit()
            con.close()
            
            return redirect(url_for('settings'))

        elif form_type == 'create_feedback_defition':
            # Create new feedback definition
            name = request.form.get('feedback_name')
            description = request.form.get('feedback_description')
            color = request.form.get('feedback_color')

            con = get_database_connection()
            cur = con.cursor()

            cur.execute("""
                INSERT INTO feedbacks_definition (name, description, color) 
                VALUES(?, ?, ?)
            """, (name, description, color))
            
            con.commit()
            con.close()
            
            return redirect(url_for('settings'))


@app.route('/settings/steps/<int:step_id>/check_applications', methods=['GET'])
def check_steps_applications(step_id):
    """
    Check how many applications are using a specific step definition.
    
    Args:
        step_id (int): ID of the step definition to check
        
    Returns:
        dict: JSON response with application count
    """
    con = get_database_connection()
    cur = con.cursor()
    
    # Count distinct applications that have used this step
    cur.execute("""
        SELECT COUNT(DISTINCT application_id) 
        FROM steps 
        WHERE step_id = ?
    """, [step_id])
    count = cur.fetchone()[0]
    
    con.close()
    
    return {'count': count}


@app.route('/settings/steps/<int:step_id>/update', methods=['POST'])
def update_step_definition(step_id):
    """
    Update an existing step definition.
    
    Args:
        step_id (int): ID of the step definition to update
        
    Returns:
        Response: Redirect to settings page
    """
    name = request.form.get('step_name')
    description = request.form.get('step_description')
    color = request.form.get('step_color')

    con = get_database_connection()
    cur = con.cursor()

    # Update step definition
    cur.execute("""
        UPDATE steps_definition 
        SET name = ?, description = ?, color = ? 
        WHERE id = ?
    """, (name, description, color, step_id))
    
    con.commit()
    con.close()
    
    return redirect(url_for('settings'))


@app.route('/settings/steps/<int:step_id>/delete', methods=['POST'])
def delete_step_definition(step_id):
    """
    Delete a step definition and all applications that use it.
    
    WARNING: This is a destructive operation that deletes applications!
    
    Args:
        step_id (int): ID of the step definition to delete
        
    Returns:
        Response: Redirect to settings page
    """
    con = get_database_connection()
    cur = con.cursor()

    # Delete all applications that have used this step
    # WARNING: This is destructive!
    cur.execute("""
        DELETE FROM applications 
        WHERE id IN (
            SELECT application_id 
            FROM steps 
            WHERE step_id = ?
        )
    """, [step_id])
    
    # Delete the step definition
    cur.execute("DELETE FROM steps_definition WHERE id = ?", [step_id])
    
    con.commit()
    con.close()
    
    return redirect(url_for('settings'))


@app.route('/settings/feedbacks/<int:feedback_id>/check_applications', methods=['GET'])
def check_feedbacks_applications(feedback_id):
    """
    Check how many applications are using a specific feedback definition.
    
    Args:
        feedback_id (int): ID of the feedback definition to check
        
    Returns:
        dict: JSON response with application count
    """
    con = get_database_connection()
    cur = con.cursor()
    
    # Count applications using this feedback
    cur.execute("SELECT COUNT(*) FROM applications WHERE feedback_id = ?", [feedback_id])
    count = cur.fetchone()[0]
    
    con.close()
    
    return {'count': count}


@app.route('/settings/feedbacks/<int:feedback_id>/update', methods=['POST'])
def update_feedback_definition(feedback_id):
    """
    Update an existing feedback definition.
    
    Args:
        feedback_id (int): ID of the feedback definition to update
        
    Returns:
        Response: Redirect to settings page
    """
    name = request.form.get('feedback_name')
    description = request.form.get('feedback_description')
    color = request.form.get('feedback_color')

    con = get_database_connection()
    cur = con.cursor()

    # Update feedback definition
    cur.execute("""
        UPDATE feedbacks_definition 
        SET name = ?, description = ?, color = ? 
        WHERE id = ?
    """, (name, description, color, feedback_id))
    
    con.commit()
    con.close()
    
    return redirect(url_for('settings'))


@app.route('/settings/feedbacks/<int:feedback_id>/delete', methods=['POST'])
def delete_feedback_definition(feedback_id):
    """
    Delete a feedback definition and all applications that use it.
    
    WARNING: This is a destructive operation that deletes applications!
    
    Args:
        feedback_id (int): ID of the feedback definition to delete
        
    Returns:
        Response: Redirect to settings page
    """
    con = get_database_connection()
    cur = con.cursor()

    # Delete all applications using this feedback
    # WARNING: This is destructive!
    cur.execute("DELETE FROM applications WHERE feedback_id = ?", [feedback_id])
    
    # Delete the feedback definition
    cur.execute("DELETE FROM feedbacks_definition WHERE id = ?", [feedback_id])
    
    con.commit()
    con.close()
    
    return redirect(url_for('settings'))


# Application entry point
if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=8088)