import { Git } from "node-git-server";
import { join } from "path";
import config from "./config.json";

const port =
  !process.env.PORT || isNaN(process.env.PORT)
    ? 3001
    : parseInt(process.env.PORT);

const repos = new Git(join(__dirname, "./repos"), {
  autoCreate: true,
  authenticate({ type, user }, next) {
    user(async (username, password) => {
      if (config.username !== username)
        return next(new Error("Invalid credentials"));
      if (!(await Bun.password.verify(password, config.password)))
        return next(new Error("Invalid credentials"));
      next();
    });
    // next();
  },
});

repos.on("push", (push) => {
  console.log(`push ${push.repo}/${push.commit} ( ${push.branch} )`);
  push.accept();
});

repos.on("fetch", (fetch) => {
  console.log(`fetch ${fetch.commit}`);
  fetch.accept();
});

repos.listen(port, { type: "http" }, () => {
  console.log(`node-git-server running at http://localhost:${port}`);
});
