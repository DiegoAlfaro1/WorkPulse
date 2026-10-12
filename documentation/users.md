# User structure design

---

## What users will exist in the system

1. Super admin: this user will be the owner of the app, the one that can get into any account of any company if needed, there will only be 1 of this users, this user cannot be erased, and it will not appear in any user managent screen so no one knows it exists
2. Admin: this will be the admin of company that is using the tool, lets think of this as the head of IT of the company, which will have access to everyones information, can create users, erase users etc, this user can see the information of every team in the organization
3. Manager: this will be the user that can see the information of everyone in the team that he is assinged to, we can think of this as the head of the design team, which can see the info about every member of the design team, but cant see the information on the engineering team, managers can also manage the users that are assigned to their team, they can create and delete users but only for that specific team
4. Employee: this is a normal user, they can see their own information but nothing else

Every user can create projects, view insights, use the filters etc, but they have their limitations depending on what type of user they are.

Users can also see all the projects that have been created, even if it was created by someone from a different team, this is made so that the company does not have to create a different project per team, like the design team does not have to create a project for P1 and the engineering team another
