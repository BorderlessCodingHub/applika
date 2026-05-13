# Repository Guidelines

## Documentation Hygiene (Keep This File Current)
Whenever you change code in this repo in a way that makes this document inaccurate, update `AGENTS.md` in the same change.
 
## Development standards and Philosophy
Our primary goal is to create a production ready codebase that is intuitive and easy to understand, minimizing cognitive load.

### Guiding Principles
- the folder `application_platform` is not part of the project.
- Production ready: The codebase should be good enough for deployment..
- Reduce cognitive load: Every decision should make the codebase easier to grasp and modify.
- Clarity over premature optimization: Write clear code first. Optimize only when proven necessary

## Testing instructions
- Follow Test Driven Development approach
- Fix any test or type errors until the whole suite is green.
 

## Important rules/notes
- heavy comment
- No “best effort” hiding: partial failure must be visible 
- Report if any instruction is weird, incomplete or does not make sense