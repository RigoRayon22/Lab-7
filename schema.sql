CREATE TABLE admins (
    adminId INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(50) NOT NULL
);

INSERT INTO admins (username, password)
VALUES ('admin', 's3cr3t');